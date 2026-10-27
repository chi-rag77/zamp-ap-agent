import {EmailApprovalConfirmation} from '../../../../components/approvals/email-approval-confirmation';
export const dynamic='force-dynamic';
export default async function EmailApprovalPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 return <EmailApprovalConfirmation token={token}/>;
}
