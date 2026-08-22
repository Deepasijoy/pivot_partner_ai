import type { Skill, JobOpportunity, FreelanceGig, CourseRecommendation } from '../types';

// ---------------------------------------------------------------------------
// Skill taxonomy — individual skill constants, reused across jobs & gigs
// ---------------------------------------------------------------------------

// Technical skills
const skillJavaScript: Skill = { name: 'JavaScript', category: 'technical', demandLevel: 'very_high', proficiency: 85 };
const skillTypeScript: Skill = { name: 'TypeScript', category: 'technical', demandLevel: 'very_high', proficiency: 82 };
const skillPython: Skill = { name: 'Python', category: 'technical', demandLevel: 'very_high', proficiency: 88 };
const skillReact: Skill = { name: 'React', category: 'technical', demandLevel: 'very_high', proficiency: 84 };
const skillNodeJS: Skill = { name: 'Node.js', category: 'technical', demandLevel: 'high', proficiency: 80 };
const skillSQL: Skill = { name: 'SQL', category: 'technical', demandLevel: 'very_high', proficiency: 86 };
const skillAWS: Skill = { name: 'AWS', category: 'technical', demandLevel: 'very_high', proficiency: 78 };
const skillDocker: Skill = { name: 'Docker', category: 'technical', demandLevel: 'high', proficiency: 75 };
const skillKubernetes: Skill = { name: 'Kubernetes', category: 'technical', demandLevel: 'high', proficiency: 70 };
const skillMachineLearning: Skill = { name: 'Machine Learning', category: 'technical', demandLevel: 'very_high', proficiency: 76 };
const skillTensorFlow: Skill = { name: 'TensorFlow', category: 'technical', demandLevel: 'high', proficiency: 68 };
const skillDataAnalysis: Skill = { name: 'Data Analysis', category: 'technical', demandLevel: 'very_high', proficiency: 83 };
const skillPowerBI: Skill = { name: 'Power BI', category: 'technical', demandLevel: 'high', proficiency: 77 };
const skillTableau: Skill = { name: 'Tableau', category: 'technical', demandLevel: 'high', proficiency: 74 };
const skillFigma: Skill = { name: 'Figma', category: 'technical', demandLevel: 'high', proficiency: 81 };
const skillUIUXDesign: Skill = { name: 'UI/UX Design', category: 'technical', demandLevel: 'high', proficiency: 79 };
const skillDevOps: Skill = { name: 'DevOps', category: 'technical', demandLevel: 'high', proficiency: 73 };
const skillCICD: Skill = { name: 'CI/CD', category: 'technical', demandLevel: 'high', proficiency: 72 };
const skillGit: Skill = { name: 'Git', category: 'technical', demandLevel: 'very_high', proficiency: 90 };
const skillRESTAPIs: Skill = { name: 'REST APIs', category: 'technical', demandLevel: 'very_high', proficiency: 85 };
const skillCloudArchitecture: Skill = { name: 'Cloud Architecture', category: 'technical', demandLevel: 'high', proficiency: 71 };
const skillSystemDesign: Skill = { name: 'System Design', category: 'technical', demandLevel: 'high', proficiency: 69 };

// Business skills
const skillFinancialModeling: Skill = { name: 'Financial Modeling', category: 'business', demandLevel: 'high', proficiency: 80 };
const skillFinancialAnalysis: Skill = { name: 'Financial Analysis', category: 'business', demandLevel: 'high', proficiency: 82 };
const skillExcel: Skill = { name: 'Excel', category: 'business', demandLevel: 'very_high', proficiency: 88 };
const skillMarketResearch: Skill = { name: 'Market Research', category: 'business', demandLevel: 'medium', proficiency: 75 };
const skillBusinessStrategy: Skill = { name: 'Business Strategy', category: 'business', demandLevel: 'high', proficiency: 78 };
const skillProjectManagement: Skill = { name: 'Project Management', category: 'business', demandLevel: 'very_high', proficiency: 84 };
const skillAgileScrum: Skill = { name: 'Agile/Scrum', category: 'business', demandLevel: 'high', proficiency: 79 };
const skillStakeholderManagement: Skill = { name: 'Stakeholder Management', category: 'business', demandLevel: 'high', proficiency: 77 };
const skillSalesStrategy: Skill = { name: 'Sales Strategy', category: 'business', demandLevel: 'medium', proficiency: 74 };
const skillMarketingStrategy: Skill = { name: 'Marketing Strategy', category: 'business', demandLevel: 'high', proficiency: 76 };
const skillContentWriting: Skill = { name: 'Content Writing', category: 'business', demandLevel: 'medium', proficiency: 81 };
const skillSEO: Skill = { name: 'SEO', category: 'business', demandLevel: 'medium', proficiency: 70 };
const skillCustomerSuccess: Skill = { name: 'Customer Success', category: 'business', demandLevel: 'high', proficiency: 80 };
const skillHRManagement: Skill = { name: 'HR Management', category: 'business', demandLevel: 'medium', proficiency: 73 };
const skillRecruitment: Skill = { name: 'Recruitment', category: 'business', demandLevel: 'medium', proficiency: 72 };
const skillOperationsManagement: Skill = { name: 'Operations Management', category: 'business', demandLevel: 'high', proficiency: 78 };
const skillProcessOptimization: Skill = { name: 'Process Optimization', category: 'business', demandLevel: 'high', proficiency: 75 };
const skillBudgeting: Skill = { name: 'Budgeting', category: 'business', demandLevel: 'medium', proficiency: 76 };
const skillForecasting: Skill = { name: 'Forecasting', category: 'business', demandLevel: 'medium', proficiency: 74 };
const skillNegotiation: Skill = { name: 'Negotiation', category: 'business', demandLevel: 'medium', proficiency: 71 };
const skillPublicSpeaking: Skill = { name: 'Public Speaking', category: 'business', demandLevel: 'medium', proficiency: 73 };
const skillGrantWriting: Skill = { name: 'Grant Writing', category: 'business', demandLevel: 'medium', proficiency: 68 };
const skillBusinessDevelopment: Skill = { name: 'Business Development', category: 'business', demandLevel: 'high', proficiency: 77 };
const skillCRM: Skill = { name: 'CRM (Salesforce/HubSpot)', category: 'business', demandLevel: 'high', proficiency: 79 };
const skillDataDrivenDecisionMaking: Skill = { name: 'Data-Driven Decision Making', category: 'business', demandLevel: 'high', proficiency: 80 };

export const mockSkillTaxonomy: { technical: Skill[]; business: Skill[] } = {
  technical: [
    skillJavaScript,
    skillTypeScript,
    skillPython,
    skillReact,
    skillNodeJS,
    skillSQL,
    skillAWS,
    skillDocker,
    skillKubernetes,
    skillMachineLearning,
    skillTensorFlow,
    skillDataAnalysis,
    skillPowerBI,
    skillTableau,
    skillFigma,
    skillUIUXDesign,
    skillDevOps,
    skillCICD,
    skillGit,
    skillRESTAPIs,
    skillCloudArchitecture,
    skillSystemDesign,
  ],
  business: [
    skillFinancialModeling,
    skillFinancialAnalysis,
    skillExcel,
    skillMarketResearch,
    skillBusinessStrategy,
    skillProjectManagement,
    skillAgileScrum,
    skillStakeholderManagement,
    skillSalesStrategy,
    skillMarketingStrategy,
    skillContentWriting,
    skillSEO,
    skillCustomerSuccess,
    skillHRManagement,
    skillRecruitment,
    skillOperationsManagement,
    skillProcessOptimization,
    skillBudgeting,
    skillForecasting,
    skillNegotiation,
    skillPublicSpeaking,
    skillGrantWriting,
    skillBusinessDevelopment,
    skillCRM,
    skillDataDrivenDecisionMaking,
  ],
};

// ---------------------------------------------------------------------------
// Remote jobs — 8 technical + 7 non-technical
// ---------------------------------------------------------------------------

export const mockRemoteJobs: JobOpportunity[] = [
  {
    id: 'job_001',
    title: 'Software Engineer',
    company: 'GitLab',
    salaryRange: '$120K-150K',
    timezone: 'UTC-8 to UTC+5',
    matchScore: 92,
    requiredSkills: [skillJavaScript, skillTypeScript, skillReact, skillNodeJS, skillGit, skillRESTAPIs],
    matchedSkills: [skillJavaScript, skillTypeScript, skillReact, skillGit, skillRESTAPIs],
    missingSkills: [skillNodeJS],
    description: 'Build and maintain core features of an all-remote DevOps platform used by millions of developers worldwide.',
    employmentMatch: 90,
  },
  {
    id: 'job_002',
    title: 'Data Analyst',
    company: 'HubSpot',
    salaryRange: '$90-120K',
    timezone: 'UTC-5 to UTC+3',
    matchScore: 88,
    requiredSkills: [skillSQL, skillDataAnalysis, skillPowerBI, skillTableau, skillDataDrivenDecisionMaking],
    matchedSkills: [skillSQL, skillDataAnalysis, skillDataDrivenDecisionMaking, skillTableau],
    missingSkills: [skillPowerBI],
    description: 'Turn marketing and product data into actionable insights for cross-functional teams at a fast-growing SaaS company.',
    employmentMatch: 87,
  },
  {
    id: 'job_003',
    title: 'Backend Engineer',
    company: 'Stripe',
    salaryRange: '$130K-160K',
    timezone: 'UTC-8 to UTC+5',
    matchScore: 91,
    requiredSkills: [skillPython, skillSQL, skillAWS, skillSystemDesign, skillRESTAPIs],
    matchedSkills: [skillPython, skillSQL, skillRESTAPIs, skillAWS],
    missingSkills: [skillSystemDesign],
    description: 'Design and scale payment infrastructure APIs that process billions of dollars in transactions annually.',
    employmentMatch: 89,
  },
  {
    id: 'job_004',
    title: 'UX Designer',
    company: 'Figma',
    salaryRange: '$100K-130K',
    timezone: 'UTC-8 to UTC+2',
    matchScore: 90,
    requiredSkills: [skillFigma, skillUIUXDesign, skillStakeholderManagement, skillMarketResearch],
    matchedSkills: [skillFigma, skillUIUXDesign, skillStakeholderManagement],
    missingSkills: [skillMarketResearch],
    description: 'Craft intuitive design-tool experiences used by product teams across the globe, working closely with engineering.',
    employmentMatch: 88,
  },
  {
    id: 'job_005',
    title: 'Product Manager',
    company: 'Notion',
    salaryRange: '$120K-150K',
    timezone: 'UTC-8 to UTC+3',
    matchScore: 87,
    requiredSkills: [skillProjectManagement, skillAgileScrum, skillStakeholderManagement, skillDataAnalysis, skillBusinessStrategy],
    matchedSkills: [skillProjectManagement, skillAgileScrum, skillStakeholderManagement, skillDataAnalysis],
    missingSkills: [skillBusinessStrategy],
    description: 'Own the roadmap for a core productivity feature area, partnering with design and engineering to ship for millions of users.',
    employmentMatch: 86,
  },
  {
    id: 'job_006',
    title: 'Full-Stack Developer',
    company: 'Shopify',
    salaryRange: '$110K-140K',
    timezone: 'UTC-5 to UTC+2',
    matchScore: 93,
    requiredSkills: [skillJavaScript, skillReact, skillNodeJS, skillSQL, skillGit],
    matchedSkills: [skillJavaScript, skillReact, skillNodeJS, skillSQL, skillGit],
    missingSkills: [],
    description: 'Ship end-to-end features across the commerce platform that powers millions of online storefronts.',
    employmentMatch: 92,
  },
  {
    id: 'job_007',
    title: 'DevOps Engineer',
    company: 'Wise',
    salaryRange: '$115K-145K',
    timezone: 'UTC+0 to UTC+8',
    matchScore: 85,
    requiredSkills: [skillDocker, skillKubernetes, skillAWS, skillCICD, skillCloudArchitecture],
    matchedSkills: [skillDocker, skillAWS, skillCICD],
    missingSkills: [skillKubernetes, skillCloudArchitecture],
    description: 'Own CI/CD pipelines and cloud infrastructure reliability for a global money-transfer platform.',
    employmentMatch: 82,
  },
  {
    id: 'job_008',
    title: 'Machine Learning Engineer',
    company: 'Remote.com',
    salaryRange: '$135K-165K',
    timezone: 'UTC-8 to UTC+5',
    matchScore: 86,
    requiredSkills: [skillPython, skillMachineLearning, skillTensorFlow, skillSQL, skillDataAnalysis],
    matchedSkills: [skillPython, skillMachineLearning, skillSQL],
    missingSkills: [skillTensorFlow],
    description: 'Build fraud-detection and matching models that power a global remote employment platform.',
    employmentMatch: 84,
  },
  {
    id: 'job_009',
    title: 'Financial Analyst',
    company: 'Wise',
    salaryRange: '$90-120K',
    timezone: 'UTC+0 to UTC+8',
    matchScore: 89,
    requiredSkills: [skillFinancialModeling, skillFinancialAnalysis, skillExcel, skillForecasting, skillDataAnalysis],
    matchedSkills: [skillFinancialModeling, skillFinancialAnalysis, skillExcel, skillDataAnalysis],
    missingSkills: [skillForecasting],
    description: 'Analyze pricing and unit economics for cross-border payment products used by millions of customers.',
    employmentMatch: 91,
  },
  {
    id: 'job_010',
    title: 'Business Analyst',
    company: 'Zapier',
    salaryRange: '$85-110K',
    timezone: 'UTC-8 to UTC+3',
    matchScore: 87,
    requiredSkills: [skillDataAnalysis, skillSQL, skillBusinessStrategy, skillExcel, skillStakeholderManagement],
    matchedSkills: [skillDataAnalysis, skillExcel, skillStakeholderManagement],
    missingSkills: [skillSQL, skillBusinessStrategy],
    description: 'Translate operational data into recommendations that shape product and automation strategy for a fully remote team.',
    employmentMatch: 83,
  },
  {
    id: 'job_011',
    title: 'Operations Manager',
    company: 'Buffer',
    salaryRange: '$95-125K',
    timezone: 'UTC-8 to UTC+3',
    matchScore: 90,
    requiredSkills: [skillOperationsManagement, skillProcessOptimization, skillProjectManagement, skillBudgeting],
    matchedSkills: [skillOperationsManagement, skillProcessOptimization, skillProjectManagement],
    missingSkills: [skillBudgeting],
    description: 'Streamline internal operations and vendor management for a fully distributed social media company.',
    employmentMatch: 88,
  },
  {
    id: 'job_012',
    title: 'Marketing Manager',
    company: 'HubSpot',
    salaryRange: '$100K-130K',
    timezone: 'UTC-5 to UTC+3',
    matchScore: 85,
    requiredSkills: [skillMarketingStrategy, skillSEO, skillContentWriting, skillCRM, skillDataAnalysis],
    matchedSkills: [skillMarketingStrategy, skillContentWriting, skillCRM],
    missingSkills: [skillSEO, skillDataAnalysis],
    description: 'Lead campaign strategy and lifecycle marketing for a category-leading inbound marketing platform.',
    employmentMatch: 81,
  },
  {
    id: 'job_013',
    title: 'Customer Success Manager',
    company: 'Notion',
    salaryRange: '$80-110K',
    timezone: 'UTC-8 to UTC+3',
    matchScore: 91,
    requiredSkills: [skillCustomerSuccess, skillStakeholderManagement, skillCRM, skillNegotiation],
    matchedSkills: [skillCustomerSuccess, skillStakeholderManagement, skillCRM, skillNegotiation],
    missingSkills: [],
    description: 'Own the post-sale relationship for enterprise customers, driving adoption and renewal across a remote-first customer base.',
    employmentMatch: 92,
  },
  {
    id: 'job_014',
    title: 'Content Manager',
    company: 'Buffer',
    salaryRange: '$80-110K',
    timezone: 'UTC-8 to UTC+3',
    matchScore: 86,
    requiredSkills: [skillContentWriting, skillSEO, skillMarketingStrategy, skillPublicSpeaking],
    matchedSkills: [skillContentWriting, skillMarketingStrategy],
    missingSkills: [skillSEO, skillPublicSpeaking],
    description: 'Own the editorial calendar and brand voice for a fully remote company known for its transparent culture blog.',
    employmentMatch: 84,
  },
  {
    id: 'job_015',
    title: 'HR Manager',
    company: 'Automattic',
    salaryRange: '$90-120K',
    timezone: 'UTC-8 to UTC+8',
    matchScore: 88,
    requiredSkills: [skillHRManagement, skillRecruitment, skillStakeholderManagement, skillNegotiation],
    matchedSkills: [skillHRManagement, skillStakeholderManagement, skillNegotiation],
    missingSkills: [skillRecruitment],
    description: 'Manage the full employee lifecycle for a globally distributed team spanning over 90 countries.',
    employmentMatch: 85,
  },
];

// ---------------------------------------------------------------------------
// Freelance gigs — 5 tech + 5 non-tech
// ---------------------------------------------------------------------------

export const mockFreelanceGigs: FreelanceGig[] = [
  {
    id: 'gig_001',
    title: 'Power BI Dashboard Development',
    budget: '$3K-8K',
    duration: '6 weeks',
    requiredSkills: [skillPowerBI, skillSQL, skillDataAnalysis],
    matchPercentage: 91,
    platform: 'Upwork',
  },
  {
    id: 'gig_002',
    title: 'SQL Query Optimization',
    budget: '$2K-5K',
    duration: '2 weeks',
    requiredSkills: [skillSQL, skillDataAnalysis],
    matchPercentage: 94,
    platform: 'Toptal',
  },
  {
    id: 'gig_003',
    title: 'React Component Development',
    budget: '$5K-10K',
    duration: '1 month',
    requiredSkills: [skillReact, skillTypeScript, skillJavaScript],
    matchPercentage: 89,
    platform: 'Upwork',
  },
  {
    id: 'gig_004',
    title: 'Data Visualization',
    budget: '$3K-8K',
    duration: '3 weeks',
    requiredSkills: [skillTableau, skillDataAnalysis],
    matchPercentage: 87,
    platform: 'Guru',
  },
  {
    id: 'gig_005',
    title: 'AWS Cloud Migration',
    budget: '$8K-15K',
    duration: '3 months',
    requiredSkills: [skillAWS, skillCloudArchitecture, skillDevOps],
    matchPercentage: 82,
    platform: 'Toptal',
  },
  {
    id: 'gig_006',
    title: 'Financial Forecasting',
    budget: '$3K-8K',
    duration: '1 month',
    requiredSkills: [skillFinancialModeling, skillForecasting, skillExcel],
    matchPercentage: 90,
    platform: 'PeoplePerHour',
  },
  {
    id: 'gig_007',
    title: 'Market Research Analysis',
    budget: '$2K-5K',
    duration: '2 weeks',
    requiredSkills: [skillMarketResearch, skillDataAnalysis],
    matchPercentage: 88,
    platform: 'Upwork',
  },
  {
    id: 'gig_008',
    title: 'Business Content Writing',
    budget: '$2K-5K',
    duration: '3 weeks',
    requiredSkills: [skillContentWriting, skillSEO],
    matchPercentage: 92,
    platform: 'PeoplePerHour',
  },
  {
    id: 'gig_009',
    title: 'Excel Financial Modeling',
    budget: '$3K-8K',
    duration: '1 month',
    requiredSkills: [skillExcel, skillFinancialModeling, skillFinancialAnalysis],
    matchPercentage: 93,
    platform: 'Guru',
  },
  {
    id: 'gig_010',
    title: 'Marketing Strategy Consulting',
    budget: '$5K-10K',
    duration: '6 weeks',
    requiredSkills: [skillMarketingStrategy, skillBusinessStrategy, skillCRM],
    matchPercentage: 85,
    platform: 'Toptal',
  },
];

// ---------------------------------------------------------------------------
// Salary benchmarks
// ---------------------------------------------------------------------------

export const mockSalaryBenchmarks = {
  'Software Engineer': {
    role: 'Software Engineer',
    remote: '$120-180K',
    local: '$50-80K',
  },
  'Data Analyst': {
    role: 'Data Analyst',
    remote: '$100-150K',
    local: '$40-60K',
  },
  'Backend Engineer': {
    role: 'Backend Engineer',
    remote: '$130-160K',
    local: '$50-85K',
  },
  'Financial Analyst': {
    role: 'Financial Analyst',
    remote: '$90-120K',
    local: '$35-55K',
  },
  'Business Analyst': {
    role: 'Business Analyst',
    remote: '$85-110K',
    local: '$30-50K',
  },
  'Project Manager': {
    role: 'Project Manager',
    remote: '$95-135K',
    local: '$40-60K',
  },
};

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const mockCourses: CourseRecommendation[] = [
  {
    id: 'course_001',
    title: 'Advanced SQL for Data Analysis',
    platform: 'DataCamp',
    durationWeeks: 4,
    cost: '$99',
    skillGained: 'SQL',
  },
  {
    id: 'course_002',
    title: 'Power BI Masterclass',
    platform: 'Udemy',
    durationWeeks: 6,
    cost: '$199',
    skillGained: 'Power BI',
  },
  {
    id: 'course_003',
    title: 'Python for Data Science',
    platform: 'Coursera',
    durationWeeks: 6,
    cost: '$249',
    skillGained: 'Python',
  },
  {
    id: 'course_004',
    title: 'Leadership Essentials',
    platform: 'Coursera',
    durationWeeks: 8,
    cost: '$249',
    skillGained: 'Leadership',
  },
  {
    id: 'course_005',
    title: 'Financial Modeling',
    platform: 'Udemy',
    durationWeeks: 5,
    cost: '$179',
    skillGained: 'Financial Modeling',
  },
  {
    id: 'course_006',
    title: 'Business Analysis Foundations',
    platform: 'Udemy',
    durationWeeks: 7,
    cost: '$199',
    skillGained: 'Business Analysis',
  },
  {
    id: 'course_007',
    title: 'React Fundamentals',
    platform: 'Udemy',
    durationWeeks: 5,
    cost: '$179',
    skillGained: 'React',
  },
  {
    id: 'course_008',
    title: 'AWS Solutions Architect',
    platform: 'Linux Academy',
    durationWeeks: 8,
    cost: '$299',
    skillGained: 'AWS',
  },
  {
    id: 'course_009',
    title: 'Project Management Professional',
    platform: 'Coursera',
    durationWeeks: 12,
    cost: '$399',
    skillGained: 'Project Management',
  },
  {
    id: 'course_010',
    title: 'Strategic Communication',
    platform: 'Coursera',
    durationWeeks: 4,
    cost: '$129',
    skillGained: 'Communication',
  },
  {
    id: 'course_011',
    title: 'Node.js: The Complete Guide',
    platform: 'Udemy',
    durationWeeks: 4,
    cost: '$50',
    skillGained: 'Node.js',
  },
  {
    id: 'course_012',
    title: 'Software Architecture & System Design',
    platform: 'Educative',
    durationWeeks: 6,
    cost: '$79',
    skillGained: 'System Design',
  },
  {
    id: 'course_013',
    title: 'Kubernetes for Developers',
    platform: 'Pluralsight',
    durationWeeks: 4,
    cost: '$29/mo',
    skillGained: 'Kubernetes',
  },
  {
    id: 'course_014',
    title: 'Architecting on AWS',
    platform: 'Coursera',
    durationWeeks: 6,
    cost: '$49/mo',
    skillGained: 'Cloud Architecture',
  },
  {
    id: 'course_015',
    title: 'TensorFlow Developer Certificate',
    platform: 'Coursera',
    durationWeeks: 8,
    cost: '$49/mo',
    skillGained: 'TensorFlow',
  },
  {
    id: 'course_016',
    title: 'Market Research and Consumer Behavior',
    platform: 'edX',
    durationWeeks: 5,
    cost: '$99',
    skillGained: 'Market Research',
  },
  {
    id: 'course_017',
    title: 'Financial Forecasting for Business',
    platform: 'LinkedIn Learning',
    durationWeeks: 2,
    cost: '$29.99/mo',
    skillGained: 'Forecasting',
  },
  {
    id: 'course_018',
    title: 'SEO Fundamentals',
    platform: 'Semrush Academy',
    durationWeeks: 2,
    cost: 'Free',
    skillGained: 'SEO',
  },
  {
    id: 'course_019',
    title: 'Budgeting and Scheduling Projects',
    platform: 'Coursera',
    durationWeeks: 3,
    cost: '$49/mo',
    skillGained: 'Budgeting',
  },
  {
    id: 'course_020',
    title: 'Dynamic Public Speaking',
    platform: 'Coursera',
    durationWeeks: 5,
    cost: '$49/mo',
    skillGained: 'Public Speaking',
  },
  {
    id: 'course_021',
    title: 'Recruiting, Hiring, and Onboarding Employees',
    platform: 'Coursera',
    durationWeeks: 4,
    cost: '$49/mo',
    skillGained: 'Recruitment',
  },
];
