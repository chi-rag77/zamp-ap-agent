export type Category = 'All integrations'|'ERP & Finance'|'Procurement'|'Communication'|'Storage'|'Developer tools';
export const categories:Category[]=['All integrations','ERP & Finance','Procurement','Communication','Storage','Developer tools'];
export type ConnectorDefinition={id:string;name:string;category:Category;description:string;mark:string;color:string;available:boolean;protocol:string;capabilities:string[]};
const entry=(id:string,name:string,category:Category,description:string,mark:string,color:string,protocol='REST',available=false,capabilities:string[]=[]):ConnectorDefinition=>({id,name,category,description,mark,color,protocol,available,capabilities});
export const catalog:ConnectorDefinition[]=[
 entry('sap','SAP S/4HANA','ERP & Finance','Connect purchase orders, suppliers and supplier invoices.','SAP','#0b7bb5','OData'),
 entry('sap-ecc','SAP ECC','ERP & Finance','Bring your existing SAP finance operations into Zamp.','SAP','#0b7bb5','SOAP'),
 entry('oracle','Oracle Fusion','ERP & Finance','Connect payables, purchasing and supplier records.','O','#c74634'),
 entry('dynamics365','Microsoft Dynamics 365','ERP & Finance','Connect finance entities and procurement records.','D','#6354b6','OData'),
 entry('netsuite','NetSuite','ERP & Finance','Connect vendor bills and financial master data.','N','#31556c'),
 entry('workday','Workday','ERP & Finance','Connect financial management and supplier data.','W','#e99a13'),
 entry('coupa','Coupa','Procurement','Connect spend management and purchase orders.','C','#2587c8'),
 entry('ariba','SAP Ariba','Procurement','Connect sourcing, suppliers and procurement.','A','#0b7bb5'),
 entry('jaggaer','JAGGAER','Procurement','Connect sourcing and procurement workflows.','J','#313c56'),
 entry('ivalua','Ivalua','Procurement','Connect source-to-pay data and processes.','I','#d36b25'),
 entry('slack','Slack','Communication','Deliver exception alerts and approval notifications.','S','#65406d'),
 entry('teams','Microsoft Teams','Communication','Deliver Adaptive Cards through Teams Workflows.','T','#6264a7','Webhook'),
 entry('gmail','Gmail','Communication','Receive invoice attachments from your connected mailbox.','M','#cc5148','OAuth',true,['Invoice intake','Attachment extraction','Scheduled sync']),
 entry('outlook','Outlook','Communication','Receive invoices through Microsoft 365 mail.','O','#2677c4','OAuth'),
 entry('email','Email','Communication','Send transactional updates from your mail provider.','@','#677d99','SMTP'),
 entry('s3','Amazon S3','Storage','Store documents in your own S3 buckets.','S3','#b57832'),
 entry('azure','Azure Blob Storage','Storage','Connect invoice documents and archive containers.','Az','#287ac2'),
 entry('gcs','Google Cloud Storage','Storage','Connect buckets for secure document storage.','G','#5185c3'),
 entry('sftp','SFTP','Storage','Exchange files with your enterprise file server.','SF','#59758c','SFTP'),
 entry('sharepoint','SharePoint','Storage','Connect document libraries and invoice archives.','S','#218b85'),
 entry('rest','REST API','Developer tools','Configure and test a read-only HTTPS connection.','{}','#4776bf','REST',true,['GET connection test','API key / bearer authentication','OpenAPI discovery']),
 entry('odata','OData','Developer tools','Configure and test an OData HTTPS service.','O₂','#497ab3','OData',true,['GET connection test','API key / bearer authentication']),
 entry('soap','SOAP','Developer tools','Connect enterprise web services using WSDL.','<>','#6983a2','SOAP'),
 entry('webhook','Webhook','Developer tools','Subscribe external systems to verified events.','↗','#6888a6','Webhook'),
 entry('graphql','GraphQL','Developer tools','Connect typed APIs with custom queries.','GQ','#b75189','GraphQL'),
 entry('csv','CSV import','Developer tools','Map structured files into canonical entities.','CSV','#3b8e6a','CSV'),
 entry('xlsx','Excel import','Developer tools','Import and map spreadsheet data.','X','#3b8e6a','XLSX'),
 entry('servicenow','ServiceNow','Developer tools','Connect service workflows and exception tickets.','SN','#4b7e6e')
];
export type IntegrationStatus='CONFIGURING'|'HEALTHY'|'ERROR'|'DISCONNECTED';
export type Integration={id:string;name:string;provider:string;environment:'development'|'staging'|'production';status:IntegrationStatus;endpoint:string;test_path:string;auth_type:'none'|'bearer'|'api_key';credential_ref:string|null;header_name:string;version:number;last_tested_at:string|null;last_error:string|null;created_at:string};
export type IntegrationRun={id:string;integration_id:string;operation:string;status:'RUNNING'|'SUCCEEDED'|'FAILED';duration_ms:number|null;http_status:number|null;error_code:string|null;created_at:string};
export type IntegrationAudit={id:string;integration_id:string;action:string;created_at:string};
export type HubData={integrations:Integration[];runs:IntegrationRun[];audit:IntegrationAudit[];error?:string};
