/**
 * Canonical certification catalog (vendor-published exam names).
 * Used for: (1) the sale-form dropdown seed, (2) matching legacy Sale.course text.
 *
 * Fields: vendor, code, name, aliases (extra spellings/keywords seen in sales data).
 * Review/extend freely - any cert missing here can be added via the admin catalog page later.
 */
const c = (vendor, code, name, aliases = []) => ({ vendor, code, name, aliases });

const MS = 'Microsoft';
const AWS = 'AWS';
const CT = 'CompTIA';
const CS = 'Cisco';

const catalog = [
  // ───────── Microsoft: Azure ─────────
  c(MS, 'AZ-900', 'Microsoft Azure Fundamentals', ['az900', 'azure fundamentals']),
  c(MS, 'AZ-104', 'Microsoft Azure Administrator', ['azure administrator']),
  c(MS, 'AZ-204', 'Developing Solutions for Microsoft Azure'),
  c(MS, 'AZ-305', 'Designing Microsoft Azure Infrastructure Solutions'),
  c(MS, 'AZ-400', 'Designing and Implementing Microsoft DevOps Solutions'),
  c(MS, 'AZ-500', 'Microsoft Azure Security Technologies'),
  c(MS, 'AZ-700', 'Designing and Implementing Microsoft Azure Networking Solutions'),
  c(MS, 'AZ-800', 'Administering Windows Server Hybrid Core Infrastructure'),
  c(MS, 'AZ-801', 'Configuring Windows Server Hybrid Advanced Services'),
  // ───────── Microsoft: Security ─────────
  c(MS, 'SC-100', 'Microsoft Cybersecurity Architect'),
  c(MS, 'SC-200', 'Microsoft Security Operations Analyst'),
  c(MS, 'SC-300', 'Microsoft Identity and Access Administrator'),
  c(MS, 'SC-400', 'Microsoft Information Protection Administrator'),
  c(MS, 'SC-401', 'Administering Information Security in Microsoft 365'),
  c(MS, 'SC-900', 'Microsoft Security, Compliance, and Identity Fundamentals'),
  // ───────── Microsoft: Power Platform ─────────
  c(MS, 'PL-100', 'Microsoft Power Platform App Maker'),
  c(MS, 'PL-200', 'Microsoft Power Platform Functional Consultant'),
  c(MS, 'PL-300', 'Microsoft Power BI Data Analyst', ['power bi', 'bi power']),
  c(MS, 'PL-400', 'Microsoft Power Platform Developer'),
  c(MS, 'PL-500', 'Microsoft Power Automate RPA Developer'),
  c(MS, 'PL-600', 'Microsoft Power Platform Solution Architect'),
  c(MS, 'PL-900', 'Microsoft Power Platform Fundamentals'),
  // ───────── Microsoft: AI / Data ─────────
  c(MS, 'AI-900', 'Microsoft Azure AI Fundamentals'),
  c(MS, 'AI-102', 'Designing and Implementing a Microsoft Azure AI Solution'),
  c(MS, 'DP-100', 'Designing and Implementing a Data Science Solution on Azure'),
  c(MS, 'DP-203', 'Data Engineering on Microsoft Azure'),
  c(MS, 'DP-300', 'Administering Microsoft Azure SQL Solutions'),
  c(MS, 'DP-600', 'Implementing Analytics Solutions Using Microsoft Fabric'),
  c(MS, 'DP-700', 'Implementing Data Engineering Solutions Using Microsoft Fabric'),
  c(MS, 'DP-900', 'Microsoft Azure Data Fundamentals'),
  // ───────── Microsoft: 365 / Endpoint ─────────
  c(MS, 'MS-102', 'Microsoft 365 Administrator'),
  c(MS, 'MS-700', 'Managing Microsoft Teams'),
  c(MS, 'MS-721', 'Collaboration Communications Systems Engineer'),
  c(MS, 'MS-900', 'Microsoft 365 Fundamentals'),
  c(MS, 'MS-920', 'Microsoft Teams Fundamentals'),
  c(MS, 'MD-102', 'Microsoft Endpoint Administrator'),
  // ───────── Microsoft: Dynamics / Business ─────────
  c(MS, 'MB-210', 'Microsoft Dynamics 365 Sales'),
  c(MS, 'MB-230', 'Microsoft Dynamics 365 Customer Service'),
  c(MS, 'MB-310', 'Microsoft Dynamics 365 Finance'),
  c(MS, 'MB-330', 'Microsoft Dynamics 365 Supply Chain Management'),
  c(MS, 'MB-500', 'Microsoft Dynamics 365 Finance and Operations Apps Developer'),
  c(MS, 'MB-800', 'Microsoft Dynamics 365 Business Central Functional Consultant'),
  c(MS, 'MB-910', 'Microsoft Dynamics 365 Fundamentals (CRM)'),
  c(MS, 'MB-920', 'Microsoft Dynamics 365 Fundamentals (ERP)'),
  c(MS, 'AB-100', 'Agentic AI Business Solutions Architect'),
  c(MS, 'AB-730', 'AI Business Professional'),
  c(MS, 'AB-731', 'AI Transformation Leader'),
  c(MS, 'AB-900', 'Microsoft 365 Copilot and Agent Administration Fundamentals'),

  // ───────── AWS ─────────
  c(AWS, 'CLF-C02', 'AWS Certified Cloud Practitioner', ['aws cp', 'aws cloud practitioner', 'cloud practitioner', 'aws cloud practioner', 'aws clf']),
  c(AWS, 'AIF-C01', 'AWS Certified AI Practitioner', ['aws ai practitioner', 'ai practitioner', 'aws ai']),
  c(AWS, 'SAA-C03', 'AWS Certified Solutions Architect – Associate', ['aws saa', 'aws associate', 'associate aws', 'aws solutions architect associate']),
  c(AWS, 'DVA-C02', 'AWS Certified Developer – Associate', ['aws dva', 'aws developer', 'aws developer associate']),
  c(AWS, 'SOA-C02', 'AWS Certified CloudOps Engineer – Associate', ['aws soa', 'c02 soa']),
  c(AWS, 'DEA-C01', 'AWS Certified Data Engineer – Associate', ['aws dea', 'aws data engineer', 'aws data']),
  c(AWS, 'MLA-C01', 'AWS Certified Machine Learning Engineer – Associate', ['aws mla', 'aws ml', 'aws learning machine']),
  c(AWS, 'SAP-C02', 'AWS Certified Solutions Architect – Professional', ['aws sap', 'awssap', 'aws pro', 'aws professional solution', 'aws professional solutions', 'architect aws professional solution', 'architect aws professional solutions', 'aws c02 sap']),
  c(AWS, 'DOP-C02', 'AWS Certified DevOps Engineer – Professional', ['aws dop', 'aws devops', 'aws devops professional']),
  c(AWS, 'ANS-C01', 'AWS Certified Advanced Networking – Specialty', ['aws ans', 'aws networking']),
  c(AWS, 'MLS-C01', 'AWS Certified Machine Learning – Specialty', ['aws mls']),
  c(AWS, 'SCS-C02', 'AWS Certified Security – Specialty', ['aws scs', 'aws security']),
  c(AWS, 'PAS-C01', 'AWS Certified SAP on AWS – Specialty', ['aws pas']),

  // ───────── CompTIA ─────────
  c(CT, 'A+', 'CompTIA A+', ['a+', 'comptia a+', 'comptia a']),
  c(CT, 'Network+', 'CompTIA Network+', ['network+', 'comptia network+']),
  c(CT, 'Security+', 'CompTIA Security+', ['security+', 'comptia security+', 'sec+', 'comptia sec+', 'security plus']),
  c(CT, 'CySA+', 'CompTIA Cybersecurity Analyst (CySA+)', ['cysa+', 'cysa', 'comptia cysa+']),
  c(CT, 'PenTest+', 'CompTIA PenTest+', ['pentest+', 'comptia pentest']),
  c(CT, 'CASP+', 'CompTIA Advanced Security Practitioner (CASP+)', ['casp+', 'casp', 'securityx']),
  c(CT, 'Linux+', 'CompTIA Linux+', ['linux+', 'linux']),
  c(CT, 'Cloud+', 'CompTIA Cloud+', ['cloud+', 'comptia cloud']),
  c(CT, 'Server+', 'CompTIA Server+', ['server+']),
  c(CT, 'Project+', 'CompTIA Project+', ['project+']),
  c(CT, 'Data+', 'CompTIA Data+', ['data+']),
  c(CT, 'Tech+', 'CompTIA Tech+', ['tech+', 'comptia tech']),

  // ───────── Cisco ─────────
  c(CS, 'CCNA', 'Cisco Certified Network Associate (CCNA)', ['ccna']),
  c(CS, 'CCNP-ENCOR', 'Cisco CCNP Enterprise – ENCOR 350-401', ['ccnp encor', 'ccnp enterprise', 'encor']),
  c(CS, 'CCNP-SCOR', 'Cisco CCNP Security – SCOR 350-701', ['ccnp scor', 'cisco scor', 'scor', 'scr']),
  c(CS, 'CCNP-CORE', 'Cisco CCNP Core', ['ccnp core', '1 ccnp core', '2 ccnp core']),
  c(CS, 'CCST', 'Cisco Certified Support Technician (CCST)', ['ccst']),
  c(CS, 'CCIE', 'Cisco Certified Internetwork Expert (CCIE)', ['ccie']),
  c(CS, 'CCNP', 'Cisco CCNP (track not specified)', []),

  // ───────── Project management / ITSM / Agile ─────────
  c('PMI', 'PMP', 'Project Management Professional (PMP)', ['pmp']),
  c('PMI', 'CAPM', 'Certified Associate in Project Management (CAPM)', ['capm']),
  c('PMI', 'PMI-ACP', 'PMI Agile Certified Practitioner (PMI-ACP)', ['acp', 'pmi acp', 'acp pmi']),
  c('PMI', 'PMI-RMP', 'PMI Risk Management Professional (PMI-RMP)', ['rmp', 'pmi rmp']),
  c('PMI', 'PMI-PBA', 'PMI Professional in Business Analysis (PMI-PBA)', ['pba', 'pmi pba']),
  c('PMI', 'PMI-SP', 'PMI Scheduling Professional (PMI-SP)', ['pmi sp']),
  c('Axelos', 'ITIL-4F', 'ITIL 4 Foundation', ['itil', 'itil 4', 'itil foundation']),
  c('Axelos', 'ITIL-4L', 'ITIL 4 Leader', ['itil leader']),
  c('Axelos', 'PRINCE2-F', 'PRINCE2 Foundation', ['prince2 foundation', '2 foundation prince', 'prince2 foundation']),
  c('Axelos', 'PRINCE2-P', 'PRINCE2 Practitioner', ['prince2 practitioner', '2 practitioner prince']),
  c('Scrum.org/Alliance', 'CSM', 'Certified ScrumMaster (CSM)', ['csm']),
  c('Scaled Agile', 'SAFE', 'SAFe Certification', ['safe']),

  // ───────── ISACA / ISC2 / EC-Council / OffSec ─────────
  c('ISACA', 'CISA', 'Certified Information Systems Auditor (CISA)', ['cisa']),
  c('ISACA', 'CISM', 'Certified Information Security Manager (CISM)', ['cism']),
  c('ISACA', 'CRISC', 'Certified in Risk and Information Systems Control (CRISC)', ['crisc']),
  c('ISACA', 'AAISM', 'ISACA Advanced in AI Security Management (AAISM)', ['aaism']),
  c('ISC2', 'CISSP', 'Certified Information Systems Security Professional (CISSP)', ['cissp']),
  c('ISC2', 'CCSP', 'Certified Cloud Security Professional (CCSP)', ['ccsp']),
  c('EC-Council', 'CEH', 'Certified Ethical Hacker (CEH)', ['ceh', 'ceh v13']),
  c('EC-Council', 'CND', 'Certified Network Defender (CND)', ['cnd']),
  c('OffSec', 'OSCP', 'OffSec Certified Professional (OSCP)', ['oscp']),
  c('OffSec', 'OSWE', 'OffSec Web Expert (OSWE)', ['oswe']),
  c('OffSec', 'OSEP', 'OffSec Experienced Pentester (OSEP)', ['osep']),
  c('GIAC', 'GPEN', 'GIAC Penetration Tester (GPEN)', ['giac gpen', 'gpen']),

  // ───────── Cloud native / DevOps ─────────
  c('CNCF', 'CKA', 'Certified Kubernetes Administrator (CKA)', ['cka']),
  c('CNCF', 'CKAD', 'Certified Kubernetes Application Developer (CKAD)', ['ckad']),
  c('CNCF', 'CKS', 'Certified Kubernetes Security Specialist (CKS)', ['cks']),
  c('CNCF', 'KCNA', 'Kubernetes and Cloud Native Associate (KCNA)', ['kcna']),
  c('CNCF', 'KCSA', 'Kubernetes and Cloud Native Security Associate (KCSA)', ['kcsa']),
  c('HashiCorp', 'TERRAFORM', 'HashiCorp Certified: Terraform Associate', ['terraform']),
  c('Google Cloud', 'GCP', 'Google Cloud Certification (track not specified)', ['gcp']),
  c('Google Cloud', 'GCP-PDE', 'Google Cloud Professional Data Engineer', ['data engineer gcp', 'gcp data engineer']),
  c('Google Cloud', 'GCP-PCDOE', 'Google Cloud Professional Cloud DevOps Engineer', ['devops gcp', 'gcp devops']),
  c('Google Cloud', 'GCP-CDL', 'Google Cloud Digital Leader', ['cloud google', 'cloud digital leader', 'cloud google practitioner']),

  // ───────── Others seen in sales data ─────────
  c('VMware', 'VMWARE', 'VMware Certification (track not specified)', ['vmware', 'vmvare']),
  c('Fortinet', 'NSE', 'Fortinet NSE Certification', ['fortinet', 'nse4', 'nse5', 'fortinet nse4', 'adminstrator fortinet', 'analyst fortianalyzer']),
  c('Salesforce', 'SALESFORCE', 'Salesforce Certification', ['salesforce']),
  c('Snowflake', 'SNOWPRO', 'SnowPro Core Certification', ['snowpro']),
  c('Databricks', 'DATABRICKS', 'Databricks Certification', ['databricks']),
  c('NVIDIA', 'NVIDIA', 'NVIDIA AI Certification', ['aiio nvidia', 'aii ncp nvidia', 'ai infrastructure ncp']),
  c('ISO/IEC', 'ISO-27001', 'ISO/IEC 27001 Information Security (Lead Implementer/Auditor)', ['iso', '27001 iso', '2022 27001 iso', 'iso 27001', '27001 gaqm implementer iso lead']),
  c('ISO/IEC', 'ISO-14001', 'ISO 14001 Environmental Management', ['14001 iso']),
  c('ISO/IEC', 'ISO-45001', 'ISO 45001 Occupational Health & Safety', ['45001 iso']),
  c('ISTQB', 'ISTQB', 'ISTQB Software Testing Certification', ['istqb']),
  c('Oracle', 'ORACLE', 'Oracle Certification', ['oracle', 'oracle training']),
  c('IBM', 'IBM', 'IBM Certification', ['ibm']),
  c('CIMA', 'CIMA', 'CIMA Certification', ['cima']),
  c('ACCA', 'ACCA', 'ACCA Qualification', ['acca', 'acca sbr', 'acca sbl']),
];

module.exports = catalog;
