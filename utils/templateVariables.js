const defaultValue = (value, fallback = '') =>
  value === undefined || value === null || String(value).trim() === '' ? fallback : String(value).trim();

const buildTemplateVariables = (recipient = {}, context = {}) => {
  const name = defaultValue(recipient.name || recipient.fullName, 'Valued Student');
  const email = defaultValue(recipient.email, '');
  const course = defaultValue(recipient.course, 'Professional Training Program');
  const country = defaultValue(recipient.country, 'India');
  const company = defaultValue(recipient.company, 'Traincape Partner');

  const fromName =
    context.fromName ||
    recipient.counselor_name ||
    process.env.FROM_NAME ||
    'Traincape Team';

  const supportEmail =
    context.supportEmail ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_USER ||
    'sales@traincapetech.in';

  const supportPhone =
    context.supportPhone ||
    process.env.SUPPORT_PHONE ||
    '+91 98765 43210';

  return {
    name,
    email,
    course,
    country,
    company,
    student_name: name,
    course_name: course,
    counselor_name: fromName,
    support_email: supportEmail,
    support_phone: supportPhone,
    course_duration: defaultValue(context.course_duration, '3 Months'),
    course_mode: defaultValue(context.course_mode, 'Live Online Classes'),
    course_level: defaultValue(context.course_level, 'Beginner to Advanced'),
    course_outcome: defaultValue(context.course_outcome, 'Industry Certification'),
    start_date: defaultValue(context.start_date, 'Upcoming Session'),
    batch_timings: defaultValue(context.batch_timings, 'Flexible Batches'),
    demo_date: defaultValue(context.demo_date, 'This Week'),
    demo_time: defaultValue(context.demo_time, '7:00 PM IST'),
    meeting_link: defaultValue(context.meeting_link, 'https://traincapetech.in/huddle'),
    fee: defaultValue(context.fee, 'Standard Course Fee'),
    discount: defaultValue(context.discount, '10% Early Bird Off'),
    discount_deadline: defaultValue(context.discount_deadline, 'Limited Time'),
    enrollment_link: defaultValue(context.enrollment_link, 'https://traincapetech.in')
  };
};

const replaceTemplateVariables = (content = '', variables = {}) => {
  if (!content) return content;
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
    // Smart fallbacks for common tags to prevent raw {{bracket}} leaks or blank gaps
    if (key === 'name' || key === 'student_name') return 'Valued Student';
    if (key === 'counselor_name') return 'Traincape Team';
    if (key === 'course' || key === 'course_name') return 'Professional Course';
    if (key === 'start_date') return 'Upcoming Session';
    if (key === 'course_mode') return 'Online / Live';
    if (key === 'support_email') return 'sales@traincapetech.in';
    return '';
  });
};

module.exports = {
  buildTemplateVariables,
  replaceTemplateVariables
};
