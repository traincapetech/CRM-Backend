const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Sale = require('../models/Sale');
const LeadPersonSale = require('../models/LeadPersonSale');

const DEFAULT_CATEGORIES = [
  { name: 'Project Management', keywords: ['pmp', 'pmi', 'project', 'scrum', 'agile'] },
  { name: 'Data & Analytics', keywords: ['data', 'analytics', 'power bi', 'sql', 'tableau', 'excel', 'bi'] },
  { name: 'Cloud & DevOps', keywords: ['aws', 'azure', 'gcp', 'cloud', 'devops', 'docker', 'kubernetes'] },
  { name: 'Cybersecurity', keywords: ['cyber', 'security', 'cissp', 'ceh', 'pentest'] },
  { name: 'Software Development', keywords: ['full stack', 'mern', 'java', 'python', 'react', 'node', 'web'] },
  { name: 'Testing & QA', keywords: ['qa', 'testing', 'selenium', 'automation'] },
  { name: 'AI & ML', keywords: ['ai', 'ml', 'machine learning', 'artificial intelligence'] }
];

const COMMON_VARIABLES = [
  { name: 'student_name', description: 'Recipient name', example: 'Aarav' },
  { name: 'course_name', description: 'Course name', example: 'Data Analytics' },
  { name: 'course_duration', description: 'Course duration', example: '12 weeks' },
  { name: 'course_mode', description: 'Course mode', example: 'Online Live' },
  { name: 'course_level', description: 'Course level', example: 'Beginner to Intermediate' },
  { name: 'course_outcome', description: 'Primary course outcome', example: 'Job-ready portfolio and certification' },
  { name: 'start_date', description: 'Next batch start date', example: '05 Feb 2026' },
  { name: 'batch_timings', description: 'Batch timings', example: 'Weekdays 7-9 PM IST' },
  { name: 'demo_date', description: 'Demo session date', example: '20 Jan 2026' },
  { name: 'demo_time', description: 'Demo session time', example: '6:30 PM IST' },
  { name: 'meeting_link', description: 'Demo meeting link', example: 'https://meet.google.com/xxx' },
  { name: 'fee', description: 'Course fee', example: 'INR 24,999' },
  { name: 'discount', description: 'Discount amount or percent', example: '10%' },
  { name: 'discount_deadline', description: 'Offer deadline', example: '31 Jan 2026' },
  { name: 'enrollment_link', description: 'Enrollment/payment link', example: 'https://traincape.com/enroll' },
  { name: 'counselor_name', description: 'Assigned counselor name', example: 'Nisha' },
  { name: 'support_email', description: 'Support email address', example: 'support@traincapetech.com' },
  { name: 'support_phone', description: 'Support phone number', example: '+91-98765-43210' }
];

let seedInProgress = false;

const normalizeCourse = (course) => {
  if (!course || typeof course !== 'string') return '';
  return course.trim().toLowerCase();
};

const categorizeCourse = (course) => {
  const normalized = normalizeCourse(course);
  if (!normalized) return 'General Programs';

  const match = DEFAULT_CATEGORIES.find((category) =>
    category.keywords.some((keyword) => normalized.includes(keyword))
  );

  return match ? match.name : 'General Programs';
};

const getDistinctCourses = async () => {
  const [leadCourses, salesCourses, leadSalesCourses] = await Promise.all([
    Lead.distinct('course'),
    Sale.distinct('course'),
    LeadPersonSale.distinct('course')
  ]);

  const allCourses = [...leadCourses, ...salesCourses, ...leadSalesCourses]
    .map((course) => (typeof course === 'string' ? course.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(allCourses));
};

const resolveCategories = (courses) => {
  if (!courses.length) {
    return DEFAULT_CATEGORIES.map((category) => category.name);
  }

  const categorySet = new Set();
  courses.forEach((course) => {
    categorySet.add(categorizeCourse(course));
  });

  return Array.from(categorySet);
};

const buildTemplatesForCategory = (categoryName) => {
  const categoryPrefix = `[${categoryName}]`;
  return [
    {
      name: `${categoryPrefix} Course Inquiry Response`,
      category: 'marketing',
      subject: `Thanks for your interest in {{course_name}}`,
      htmlContent: `<p>Hi {{student_name}},</p>
<p>Thanks for reaching out about {{course_name}}. Here are the key details:</p>
<ul>
  <li>Duration: {{course_duration}}</li>
  <li>Mode: {{course_mode}}</li>
  <li>Level: {{course_level}}</li>
  <li>Outcome: {{course_outcome}}</li>
</ul>
<p>If you want a quick walkthrough, I can schedule a demo session for you.</p>
<p>Regards,<br/>{{counselor_name}}<br/>TrainCape Team</p>`,
      textContent: `Hi {{student_name}},\n\nThanks for reaching out about {{course_name}}. Key details:\n- Duration: {{course_duration}}\n- Mode: {{course_mode}}\n- Level: {{course_level}}\n- Outcome: {{course_outcome}}\n\nIf you want a walkthrough, I can schedule a demo session for you.\n\nRegards,\n{{counselor_name}}\nTrainCape Team`,
      variables: COMMON_VARIABLES
    },
    {
      name: `${categoryPrefix} Enrollment Follow-up`,
      category: 'marketing',
      subject: `Next steps for {{course_name}} enrollment`,
      htmlContent: `<p>Hello {{student_name}},</p>
<p>Following up on {{course_name}}. The next batch starts on {{start_date}}.</p>
<p>Batch timings: {{batch_timings}}.</p>
<p>Course fee: {{fee}}.</p>
<p>You can secure your seat here: {{enrollment_link}}</p>
<p>Let me know if you need help with enrollment.</p>
<p>Thanks,<br/>{{counselor_name}}</p>`,
      textContent: `Hello {{student_name}},\n\nFollowing up on {{course_name}}. The next batch starts on {{start_date}}.\nBatch timings: {{batch_timings}}\nCourse fee: {{fee}}\n\nSecure your seat here: {{enrollment_link}}\n\nLet me know if you need help with enrollment.\n\nThanks,\n{{counselor_name}}`,
      variables: COMMON_VARIABLES
    },
    {
      name: `${categoryPrefix} Demo Scheduling`,
      category: 'notification',
      subject: `Schedule your {{course_name}} demo`,
      htmlContent: `<p>Hi {{student_name}},</p>
<p>Let's schedule your {{course_name}} demo.</p>
<p>Date: {{demo_date}}<br/>Time: {{demo_time}}<br/>Link: {{meeting_link}}</p>
<p>If this slot does not work, share a preferred time and we will reschedule.</p>
<p>Regards,<br/>{{counselor_name}}</p>`,
      textContent: `Hi {{student_name}},\n\nLet's schedule your {{course_name}} demo.\nDate: {{demo_date}}\nTime: {{demo_time}}\nLink: {{meeting_link}}\n\nIf this slot does not work, share a preferred time and we will reschedule.\n\nRegards,\n{{counselor_name}}`,
      variables: COMMON_VARIABLES
    },
    {
      name: `${categoryPrefix} Offer & Discount`,
      category: 'marketing',
      subject: `Limited-time offer on {{course_name}}`,
      htmlContent: `<p>Hello {{student_name}},</p>
<p>We have a limited-time offer on {{course_name}}.</p>
<p>Discount: {{discount}} (valid until {{discount_deadline}})</p>
<p>Course fee after discount: {{fee}}</p>
<p>Enroll here: {{enrollment_link}}</p>
<p>Happy to help if you have any questions.</p>
<p>Thanks,<br/>{{counselor_name}}</p>`,
      textContent: `Hello {{student_name}},\n\nWe have a limited-time offer on {{course_name}}.\nDiscount: {{discount}} (valid until {{discount_deadline}})\nCourse fee after discount: {{fee}}\n\nEnroll here: {{enrollment_link}}\n\nHappy to help if you have any questions.\n\nThanks,\n{{counselor_name}}`,
      variables: COMMON_VARIABLES
    },
    {
      name: `${categoryPrefix} Onboarding`,
      category: 'transactional',
      subject: `Welcome to {{course_name}} - onboarding details`,
      htmlContent: `<p>Welcome {{student_name}},</p>
<p>We are excited to have you in {{course_name}}.</p>
<p>Your batch starts on {{start_date}}. Mode: {{course_mode}}.</p>
<p>Please keep this handy for support: {{support_email}} | {{support_phone}}</p>
<p>We will share the class link and onboarding checklist before the first session.</p>
<p>Regards,<br/>TrainCape Team</p>`,
      textContent: `Welcome {{student_name}},\n\nWe are excited to have you in {{course_name}}.\nYour batch starts on {{start_date}}. Mode: {{course_mode}}.\nSupport: {{support_email}} | {{support_phone}}\n\nWe will share the class link and onboarding checklist before the first session.\n\nRegards,\nTrainCape Team`,
      variables: COMMON_VARIABLES
    }
  ];
};

const getSeedUser = async () => {
  return (
    (await User.findOne({ role: 'Admin' }).sort({ createdAt: 1 })) ||
    (await User.findOne({ role: 'Manager' }).sort({ createdAt: 1 })) ||
    (await User.findOne({}).sort({ createdAt: 1 }))
  );
};

const seedDefaultEmailTemplates = async () => {
  if (seedInProgress) return;

  if (mongoose.connection.readyState !== 1) {
    mongoose.connection.once('open', seedDefaultEmailTemplates);
    return;
  }

  seedInProgress = true;

  try {
    const seedUser = await getSeedUser();
    if (!seedUser) {
      console.warn('⚠️ No users found. Default email templates were not seeded.');
      return;
    }

    const courses = await getDistinctCourses();
    const categories = resolveCategories(courses);

    const templatesToSeed = categories.flatMap(buildTemplatesForCategory).map((template) => ({
      ...template,
      createdBy: seedUser._id,
      isActive: true
    }));

    const existingTemplates = await EmailTemplate.find({
      name: { $in: templatesToSeed.map((template) => template.name) }
    }).select('name');

    const existingNames = new Set(existingTemplates.map((template) => template.name));
    const newTemplates = templatesToSeed.filter((template) => !existingNames.has(template.name));

    if (newTemplates.length === 0) {
      return;
    }

    await EmailTemplate.insertMany(newTemplates);
    console.log(`✅ Seeded ${newTemplates.length} default email templates across ${categories.length} categories.`);
  } catch (error) {
    console.error('❌ Failed to seed default email templates:', error);
  } finally {
    seedInProgress = false;
  }
};

module.exports = { seedDefaultEmailTemplates };
