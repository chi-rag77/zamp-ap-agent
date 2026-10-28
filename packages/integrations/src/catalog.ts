export type Category = 'All integrations'|'Communication'|'Developer tools';
export const categories:Category[]=['All integrations','Communication','Developer tools'];
export type ConnectorDefinition={id:string;name:string;category:Category;description:string;mark:string;color:string;available:boolean;protocol:string;capabilities:string[]};
const entry=(id:string,name:string,category:Category,description:string,mark:string,color:string,protocol='REST',available=false,capabilities:string[]=[]):ConnectorDefinition=>({id,name,category,description,mark,color,protocol,available,capabilities});
export const catalog:ConnectorDefinition[]=[
 entry('gmail','Gmail','Communication','Receive invoice attachments from your connected mailbox.','M','#cc5148','OAuth',true,['Invoice intake','Attachment extraction','Scheduled sync']),
 entry('rest','REST API','Developer tools','Authenticate requests from your ERP, workflow tools, or custom services.','{}','#4776bf','REST',true,['API key authentication','Postman and cURL examples']),
 entry('odata','OData API','Developer tools','OData-specific integration is not enabled in this release.','O₂','#497ab3','OData',false)
];
export type IntegrationStatus='CONFIGURING'|'HEALTHY'|'ERROR'|'DISCONNECTED';
export type Integration={id:string;name:string;provider:string;environment:'development'|'staging'|'production';status:IntegrationStatus;endpoint:string;test_path:string;auth_type:'none'|'bearer'|'api_key';credential_ref:string|null;header_name:string;version:number;last_tested_at:string|null;last_error:string|null;created_at:string};
export type IntegrationRun={id:string;integration_id:string;operation:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';duration_ms:number|null;http_status:number|null;error_code:string|null;created_at:string};
export type IntegrationAudit={id:string;integration_id:string;action:string;created_at:string};
export type HubData={integrations:Integration[];runs:IntegrationRun[];audit:IntegrationAudit[];error?:string};
