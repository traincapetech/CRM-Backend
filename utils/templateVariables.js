const defaultValue = (value) => (value === undefined || value === null ? '' : value);

const buildTemplateVariables = (recipient = {}, context = {}) => {
  const name = defaultValue(recipient.name || '');
  const email = defaultValue(recipient.email || '');
  const course = defaultValue(recipient.course || '');
  const country = defaultValue(recipient.country || '');
  const company = defaultValue(recipient.company || '');

  const fromName =
    context.fromName ||
    recipient.counselor_name ||
    process.env.FROM_NAME ||
    'Traincape Team';

  const supportEmail =
    context.supportEmail ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_USER ||
    'support@traincapetech.com';

  const supportPhone =
    context.supportPhone ||
    process.env.SUPPORT_PHONE ||
    '';

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
    course_duration: defaultValue(context.course_duration),
    course_mode: defaultValue(context.course_mode),
    course_level: defaultValue(context.course_level),
    course_outcome: defaultValue(context.course_outcome),
    start_date: defaultValue(context.start_date),
    batch_timings: defaultValue(context.batch_timings),
    demo_date: defaultValue(context.demo_date),
    demo_time: defaultValue(context.demo_time),
    meeting_link: defaultValue(context.meeting_link),
    fee: defaultValue(context.fee),
    discount: defaultValue(context.discount),
    discount_deadline: defaultValue(context.discount_deadline),
    enrollment_link: defaultValue(context.enrollment_link)
  };
};

const replaceTemplateVariables = (content = '', variables = {}) => {
  if (!content) return content;
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined || value === null || value === '') {
      return match;
    }
    return value;
  });
};

module.exports = {
  buildTemplateVariables,
  replaceTemplateVariables
};
