import { useLocalSearchParams } from "expo-router";
import { FinanceApprovalScreen } from "@/components/finance/FinanceApprovalScreen";
export default function ExpenseDetail(){const {submissionId}=useLocalSearchParams<{submissionId:string}>();return <FinanceApprovalScreen kind="expense" id={String(submissionId||"")}/>;}
