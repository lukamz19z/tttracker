import "server-only";
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {KMSClient,GenerateDataKeyCommand,DecryptCommand,DescribeKeyCommand} from "@aws-sdk/client-kms";
import {awsCredentialsProvider} from "@vercel/oidc-aws-credentials-provider";
import {confidentialKmsConfig,type ConfidentialKmsConfig} from "@/lib/people/confidential-kms-config";
import {requireConfidentialWorkload} from "@/lib/people/confidential-kms";
import {createSupabaseAdmin} from "@/lib/supabase/admin";
export type CredentialContext={organisation_id:string;integration_id:string;provider:"xero";generation:number};
export type CredentialEnvelope={ciphertext:string;nonce:string;tag:string;encrypted_dek:string;key_arn:string;environment:string;format:1};
function config():ConfidentialKmsConfig{
  // Reuse strict deployment identity validation, not the People purpose/key.
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith("TTTRACKER_CONFIDENTIAL_"))delete env[key];
  for(const [key,value] of Object.entries(process.env))if(key.startsWith("TTTRACKER_INTEGRATION_"))env[key.replace("TTTRACKER_INTEGRATION_","TTTRACKER_CONFIDENTIAL_")]=value;
  env.TTTRACKER_CONFIDENTIAL_COLLECTION_MODE="disabled";
  return confidentialKmsConfig(env);
}
function kms(c:ConfidentialKmsConfig){return new KMSClient({region:c.region,maxAttempts:2,credentials:awsCredentialsProvider({roleArn:c.roleArn,durationSeconds:900,roleSessionName:"tttracker-integration",clientConfig:{region:c.region}})});}
export function credentialAad(context:CredentialContext,environment:string,key:string){
  if(!/^[a-f0-9-]{36}$/i.test(context.organisation_id)||!/^[a-f0-9-]{36}$/i.test(context.integration_id)||context.provider!=="xero"||!Number.isSafeInteger(context.generation)||context.generation<1)throw new Error("INTEGRATION_CREDENTIAL_INTEGRITY_FAILED");
  return {purpose:"tttracker.integration-credential.xero",organisation_id:context.organisation_id,integration_id:context.integration_id,provider:context.provider,generation:String(context.generation),environment,key_arn:key,format:"1"};
}
const aad=(context:CredentialContext,env:string,key:string)=>Buffer.from(JSON.stringify(credentialAad(context,env,key)));
export async function encryptCredential(plaintext:Buffer,context:CredentialContext):Promise<CredentialEnvelope>{
  if(plaintext.length>65536)throw new Error("INTEGRATION_CREDENTIAL_INTEGRITY_FAILED");
  const c=config();await requireConfidentialWorkload(c);const client=kms(c);let key:Buffer|undefined;
  try{
    const generated=await client.send(new GenerateDataKeyCommand({KeyId:c.keyArn,KeySpec:"AES_256",EncryptionContext:credentialAad(context,c.environment,c.keyArn)}));
    try{if(generated.KeyId!==c.keyArn||generated.Plaintext?.length!==32||!generated.CiphertextBlob?.length)throw new Error();key=Buffer.from(generated.Plaintext);}finally{generated.Plaintext?.fill(0);}
    const nonce=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",key,nonce);cipher.setAAD(aad(context,c.environment,c.keyArn));
    const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return {ciphertext:ciphertext.toString("base64"),nonce:nonce.toString("base64"),tag:cipher.getAuthTag().toString("base64"),encrypted_dek:Buffer.from(generated.CiphertextBlob!).toString("base64"),key_arn:c.keyArn,environment:c.environment,format:1};
  }catch{throw new Error("INTEGRATION_CREDENTIAL_STORAGE_UNAVAILABLE");}finally{key?.fill(0);client.destroy();}
}
export async function decryptCredential(envelope:CredentialEnvelope,context:CredentialContext){
  if(envelope.ciphertext.length>90000)throw new Error("INTEGRATION_CREDENTIAL_INTEGRITY_FAILED");
  const c=config();if(envelope.format!==1||envelope.environment!==c.environment||!c.readKeyArns.includes(envelope.key_arn))throw new Error("INTEGRATION_CREDENTIAL_INTEGRITY_FAILED");
  await requireConfidentialWorkload(c);const client=kms(c);let key:Buffer|undefined;
  try{
    const blob=Buffer.from(envelope.encrypted_dek,"base64");if(blob.length<32||blob.length>6144||blob.toString("base64")!==envelope.encrypted_dek)throw new Error();
    const result=await client.send(new DecryptCommand({KeyId:envelope.key_arn,CiphertextBlob:blob,EncryptionContext:credentialAad(context,c.environment,envelope.key_arn)}));
    try{if(result.KeyId!==envelope.key_arn||result.Plaintext?.length!==32)throw new Error();key=Buffer.from(result.Plaintext);}finally{result.Plaintext?.fill(0);}
    const nonce=Buffer.from(envelope.nonce,"base64"),tag=Buffer.from(envelope.tag,"base64");if(nonce.length!==12||tag.length!==16)throw new Error();
    const decipher=createDecipheriv("aes-256-gcm",key,nonce);decipher.setAAD(aad(context,c.environment,envelope.key_arn));decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]);
  }catch{throw new Error("INTEGRATION_CREDENTIAL_INTEGRITY_FAILED");}finally{key?.fill(0);client.destroy();}
}
let cached:{until:number;key:string;ready:Promise<boolean>}|undefined;
export async function integrationCredentialReady(){
  try{
    if(process.env.TTTRACKER_INTEGRATION_CREDENTIAL_STORAGE_ENABLED!=="true")return false;
    const c=config();await requireConfidentialWorkload(c);const cacheKey=JSON.stringify(c);
    if(cached&&cached.until>Date.now()&&cached.key===cacheKey)return await cached.ready;
    const ready=(async()=>{
      const schema=await createSupabaseAdmin().from("v2_xero_credentials").select("integration_id").limit(1);if(schema.error)return false;
      const client=kms(c);try{const key=await client.send(new DescribeKeyCommand({KeyId:c.keyArn}));if(key.KeyMetadata?.Arn!==c.keyArn||key.KeyMetadata.KeyState!=="Enabled"||key.KeyMetadata.KeySpec!=="SYMMETRIC_DEFAULT")return false;}finally{client.destroy();}
      const context:CredentialContext={organisation_id:randomUUID(),integration_id:randomUUID(),provider:"xero",generation:1};const input=randomBytes(32);let output:Buffer|undefined;
      try{output=await decryptCredential(await encryptCredential(input,context),context);return timingSafeEqual(input,output);}finally{input.fill(0);output?.fill(0);}
    })().catch(()=>false);cached={until:Date.now()+300000,key:cacheKey,ready};const passed=await ready;if(!passed)cached=undefined;return passed;
  }catch{return false;}
}
