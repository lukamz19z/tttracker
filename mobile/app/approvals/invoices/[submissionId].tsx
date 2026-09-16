import { useLocalSearchParams } from "expo-router";
import { FinanceApprovalScreen } from "@/components/finance/FinanceApprovalScreen";
export default function InvoiceApprovalPage(){const {submissionId}=useLocalSearchParams<{submissionId:string}>();return <FinanceApprovalScreen kind="invoice" id={String(submissionId||"")} />;}
