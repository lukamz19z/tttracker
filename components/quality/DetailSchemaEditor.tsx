"use client";

import { DETAIL_TEMPLATES, DETAIL_TYPES, EMPTY_DETAIL_SCHEMA, type DetailField, type DetailSchema } from "@/lib/quality/operational-details";

const input = "rounded-lg border border-slate-300 px-2 py-2 text-sm min-w-0";
export function DetailSchemaEditor({ value, onChange }: { value?: DetailSchema | null; onChange: (schema: DetailSchema) => void }) {
  const schema = value || EMPTY_DETAIL_SCHEMA;
  const material = schema.material;
  const patchField = (index: number, patch: Partial<DetailField>) => onChange({ ...schema, fields: schema.fields.map((field, i) => i === index ? { ...field, ...patch } : field) });
  return <details className="col-span-full rounded-xl border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm font-bold">Operational detail fields ({schema.fields.length})</summary>
    <p className="my-2 text-xs text-slate-500">Optional by default. Keep field keys stable after use. Existing captured values are retained when configuration changes. Mobile receives configuration on its next Quality refresh.</p>
    <div className="flex flex-wrap gap-2">
      {!schema.fields.length ? DETAIL_TEMPLATES.map(template => <button type="button" key={template.name} className={input} onClick={()=>onChange(structuredClone(template.schema))}>Use {template.name}</button>) : null}
      <button type="button" className={input} onClick={()=>{
        let index = schema.fields.length + 1;
        while(schema.fields.some(field=>field.key===`field_${index}`)) index++;
        onChange({...schema,fields:[...schema.fields,{key:`field_${index}`,label:"New field",type:"text"}]});
      }}>+ Add field</button>
    </div>
    <div className="mt-3 space-y-2">{schema.fields.map((field, index)=><div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-2 md:grid-cols-4">
      <label className="grid text-xs">Label<input className={input} value={field.label} onChange={event=>patchField(index,{label:event.target.value})}/></label>
      <label className="grid text-xs">Stable key<input className={input} value={field.key} onChange={event=>patchField(index,{key:event.target.value})}/></label>
      <label className="grid text-xs">Type<select className={input} value={field.type} onChange={event=>patchField(index,{type:event.target.value as DetailField["type"]})}>{DETAIL_TYPES.map(type=><option key={type}>{type}</option>)}</select></label>
      <label className="grid text-xs">Display unit<input className={input} value={field.unit || ""} onChange={event=>patchField(index,{unit:event.target.value})}/></label>
      {["select","multi-select","change-direction"].includes(field.type) ? <label className="grid text-xs md:col-span-2">Options (one per line)<textarea className={input} value={(field.options || []).join("\n")} onChange={event=>patchField(index,{options:event.target.value.split("\n")})}/></label> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(field.required)} onChange={event=>patchField(index,{required:event.target.checked})}/>Required</label>
      <button type="button" className={input} onClick={()=>onChange({...schema,fields:schema.fields.filter((_,i)=>i!==index)})}>Remove field</button>
    </div>)}</div>
    <label className="my-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(schema.material)} onChange={event=>onChange({...schema,material:event.target.checked?{label:"",quantityField:"",dimensions:[{field:""}]}:undefined})}/>Material summary</label>
    {material ? <div className="grid gap-2 md:grid-cols-3">
      <label className="grid text-xs">Material label<input className={input} value={material.label} onChange={event=>onChange({...schema,material:{...material,label:event.target.value}})}/></label>
      <label className="grid text-xs">Quantity field<select className={input} value={material.quantityField} onChange={event=>onChange({...schema,material:{...material,quantityField:event.target.value}})}><option value="">Choose field</option>{schema.fields.filter(field=>["quantity","number"].includes(field.type)).map(field=><option value={field.key} key={field.key}>{field.label}</option>)}</select></label>
      <label className="grid text-xs">Separate by action (optional)<select className={input} value={material.actionField || ""} onChange={event=>onChange({...schema,material:{...material,actionField:event.target.value || undefined}})}><option value="">No action grouping</option>{schema.fields.map(field=><option value={field.key} key={field.key}>{field.label}</option>)}</select></label>
      <p className="col-span-full text-xs text-slate-500">Quantity is the stated quantity for that action. Removal and addition are separate totals; no quantities are inferred from descriptions or existing quantities.</p>
      {material.dimensions.map((part,index)=><div key={index} className="col-span-full flex flex-wrap gap-2">
        <select aria-label="Dimension field" className={input} value={part.field} onChange={event=>onChange({...schema,material:{...material,dimensions:material.dimensions.map((entry,i)=>i===index?{...entry,field:event.target.value}:entry)}})}><option value="">Dimension</option>{schema.fields.map(field=><option value={field.key} key={field.key}>{field.label}</option>)}</select>
        <input aria-label="Dimension prefix" placeholder="Prefix, e.g. M" className={input} value={part.prefix || ""} onChange={event=>onChange({...schema,material:{...material,dimensions:material.dimensions.map((entry,i)=>i===index?{...entry,prefix:event.target.value}:entry)}})}/>
        <input aria-label="Dimension suffix" placeholder="Suffix, e.g. mm" className={input} value={part.suffix || ""} onChange={event=>onChange({...schema,material:{...material,dimensions:material.dimensions.map((entry,i)=>i===index?{...entry,suffix:event.target.value}:entry)}})}/>
        <button type="button" className={input} onClick={()=>onChange({...schema,material:{...material,dimensions:material.dimensions.filter((_,i)=>i!==index)}})}>Remove dimension</button>
      </div>)}
      <button type="button" className={input} onClick={()=>onChange({...schema,material:{...material,dimensions:[...material.dimensions,{field:""}]}})}>+ Dimension</button>
    </div> : null}
  </details>;
}
