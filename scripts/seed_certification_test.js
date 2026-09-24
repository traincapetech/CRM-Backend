/**
 * Seed Script: IT Certification Sales Induction Test
 * Source: DocScanner May 29, 2026 (Sales Induction Manual)
 * 
 * Creates 50 MCQ questions (2 marks each = 100 total marks)
 * Test: 30 minutes, Passing = 85% = 85 marks
 * 
 * Usage: node server/scripts/seed_certification_test.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const TestQuestion = require('../models/TestQuestion');
const Test = require('../models/Test');
const User = require('../models/User');

const QUESTIONS = [
  // ── AWS ──────────────────────────────────────────────────────────────────
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the AWS Cloud Practitioner (Foundation) certification?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['AWS', 'Cloud Practitioner'],
    options: [
      { text: '$100 USD', isCorrect: true },
      { text: '$150 USD', isCorrect: false },
      { text: '$200 USD', isCorrect: false },
      { text: '$300 USD', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the AWS Cloud Practitioner exam?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['AWS'],
    options: [
      { text: '90 minutes', isCorrect: true },
      { text: '60 minutes', isCorrect: false },
      { text: '120 minutes', isCorrect: false },
      { text: '180 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'How many questions are in the AWS Cloud Practitioner exam?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['AWS', 'Cloud Practitioner'],
    options: [
      { text: '65 questions', isCorrect: true },
      { text: '50 questions', isCorrect: false },
      { text: '75 questions', isCorrect: false },
      { text: '100 questions', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'Which exam body conducts the AWS Solution Architect Associate exam?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['AWS'],
    options: [
      { text: 'Pearson VUE', isCorrect: true },
      { text: 'PSI', isCorrect: false },
      { text: 'Prometric', isCorrect: false },
      { text: 'Kryterion', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the AWS Solution Architect Associate certification?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['AWS', 'Solution Architect'],
    options: [
      { text: '$150 USD', isCorrect: true },
      { text: '$100 USD', isCorrect: false },
      { text: '$200 USD', isCorrect: false },
      { text: '$300 USD', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the AWS Solution Architect Associate?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['AWS', 'Solution Architect'],
    options: [
      { text: '130 minutes', isCorrect: true },
      { text: '90 minutes', isCorrect: false },
      { text: '180 minutes', isCorrect: false },
      { text: '60 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the AWS Solution Architect Professional certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['AWS', 'Professional'],
    options: [
      { text: '$300 USD', isCorrect: true },
      { text: '$150 USD', isCorrect: false },
      { text: '$400 USD', isCorrect: false },
      { text: '$200 USD', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the AWS Solution Architect Professional?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['AWS', 'Professional'],
    options: [
      { text: '180 minutes', isCorrect: true },
      { text: '130 minutes', isCorrect: false },
      { text: '90 minutes', isCorrect: false },
      { text: '240 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'What is the recommended training time for the AWS Cloud Practitioner course?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['AWS', 'Training'],
    options: [
      { text: '35–40 hours', isCorrect: true },
      { text: '20–25 hours', isCorrect: false },
      { text: '50–60 hours', isCorrect: false },
      { text: '10–15 hours', isCorrect: false },
    ],
  },
  {
    topic: 'AWS Certifications',
    type: 'MCQ',
    text: 'Which AWS exam is a pre-requisite for the AWS Solution Architect Professional exam?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['AWS', 'Professional'],
    options: [
      { text: 'AWS Solution Architect Associate (SAA)', isCorrect: true },
      { text: 'AWS Cloud Practitioner', isCorrect: false },
      { text: 'AWS Developer Associate', isCorrect: false },
      { text: 'AWS SysOps Administrator Associate', isCorrect: false },
    ],
  },

  // ── PMI ──────────────────────────────────────────────────────────────────
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the PMP (Project Management Professional) certification?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['PMI', 'PMP'],
    options: [
      { text: '$555 USD', isCorrect: true },
      { text: '$471 USD', isCorrect: false },
      { text: '$300 USD', isCorrect: false },
      { text: '$695 USD', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the PMP certification?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['PMI', 'PMP'],
    options: [
      { text: '4 hours', isCorrect: true },
      { text: '2 hours', isCorrect: false },
      { text: '3 hours', isCorrect: false },
      { text: '5 hours', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'How many hours of hands-on project experience are required for the PMP exam?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['PMI', 'PMP', 'Eligibility'],
    options: [
      { text: '4,500 hours', isCorrect: true },
      { text: '3,000 hours', isCorrect: false },
      { text: '2,000 hours', isCorrect: false },
      { text: '1,500 hours', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'How many PDUs (Professional Development Units) are required for PMP eligibility?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['PMI', 'PMP', 'PDU'],
    options: [
      { text: '35 PDUs', isCorrect: true },
      { text: '25 PDUs', isCorrect: false },
      { text: '45 PDUs', isCorrect: false },
      { text: '20 PDUs', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: '1 PDU (Professional Development Unit) is equal to how many hours of training?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['PMI', 'PDU'],
    options: [
      { text: '1 hour', isCorrect: true },
      { text: '2 hours', isCorrect: false },
      { text: '30 minutes', isCorrect: false },
      { text: '3 hours', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the PMI ACP (Agile Certified Practitioner) certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['PMI', 'ACP', 'Agile'],
    options: [
      { text: '$471 USD', isCorrect: true },
      { text: '$555 USD', isCorrect: false },
      { text: '$300 USD', isCorrect: false },
      { text: '$495 USD', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'Which exam body conducts the PMP certification exam?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['PMI', 'PMP'],
    options: [
      { text: 'Pearson VUE', isCorrect: true },
      { text: 'PSI', isCorrect: false },
      { text: 'Prometric', isCorrect: false },
      { text: 'Kryterion', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'What are the two methodologies accepted for PMP exam eligibility?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['PMI', 'PMP', 'Methodology'],
    options: [
      { text: 'Waterfall and Agile', isCorrect: true },
      { text: 'SCRUM and Kanban', isCorrect: false },
      { text: 'Lean and Six Sigma', isCorrect: false },
      { text: 'PRINCE2 and ITIL', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'What is the PMI membership fee?',
    marks: 2,
    difficulty: 'Hard',
    tags: ['PMI', 'Membership'],
    options: [
      { text: '$129 USD', isCorrect: true },
      { text: '$99 USD', isCorrect: false },
      { text: '$159 USD', isCorrect: false },
      { text: '$199 USD', isCorrect: false },
    ],
  },
  {
    topic: 'PMI Certifications',
    type: 'MCQ',
    text: 'What does PDU stand for in the context of PMI certifications?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['PMI', 'PDU'],
    options: [
      { text: 'Professional Development Unit', isCorrect: true },
      { text: 'Project Development Unit', isCorrect: false },
      { text: 'Professional Delivery Unit', isCorrect: false },
      { text: 'Program Development Unit', isCorrect: false },
    ],
  },

  // ── ISACA ─────────────────────────────────────────────────────────────────
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What does ISACA stand for?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['ISACA'],
    options: [
      { text: 'Information System Audit and Control Association', isCorrect: true },
      { text: 'International Security and Cyber Audit Association', isCorrect: false },
      { text: 'Information Security Assurance Council Association', isCorrect: false },
      { text: 'Institute of Systems Audit and Control Authority', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'Which exam body conducts ISACA certification exams?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['ISACA'],
    options: [
      { text: 'PSI', isCorrect: true },
      { text: 'Pearson VUE', isCorrect: false },
      { text: 'Prometric', isCorrect: false },
      { text: 'Kryterion', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What is the full form of CISA?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['ISACA', 'CISA'],
    options: [
      { text: 'Certified Information System Auditor', isCorrect: true },
      { text: 'Certified Information Security Analyst', isCorrect: false },
      { text: 'Certified Internal System Assessor', isCorrect: false },
      { text: 'Certified IT Security Auditor', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'How many years of total experience are required for the CISA certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ISACA', 'CISA'],
    options: [
      { text: '5 years', isCorrect: true },
      { text: '3 years', isCorrect: false },
      { text: '2 years', isCorrect: false },
      { text: '7 years', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CISA certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ISACA', 'CISA'],
    options: [
      { text: '$575 USD', isCorrect: true },
      { text: '$475 USD', isCorrect: false },
      { text: '$650 USD', isCorrect: false },
      { text: '$395 USD', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the CISM certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ISACA', 'CISM'],
    options: [
      { text: '190 minutes', isCorrect: true },
      { text: '120 minutes', isCorrect: false },
      { text: '240 minutes', isCorrect: false },
      { text: '90 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'How many years of security management experience are required for CISM?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ISACA', 'CISM'],
    options: [
      { text: '5 years', isCorrect: true },
      { text: '3 years', isCorrect: false },
      { text: '2 years', isCorrect: false },
      { text: '7 years', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the CRISC certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ISACA', 'CRISC'],
    options: [
      { text: '120 minutes', isCorrect: true },
      { text: '90 minutes', isCorrect: false },
      { text: '190 minutes', isCorrect: false },
      { text: '240 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What does CGEIT stand for?',
    marks: 2,
    difficulty: 'Hard',
    tags: ['ISACA', 'CGEIT'],
    options: [
      { text: 'Certified in Governance of Enterprise IT', isCorrect: true },
      { text: 'Certified Global Enterprise IT', isCorrect: false },
      { text: 'Certified Governance and Enterprise IT', isCorrect: false },
      { text: 'Certified Guide for Enterprise IT', isCorrect: false },
    ],
  },
  {
    topic: 'ISACA Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CGEIT certification?',
    marks: 2,
    difficulty: 'Hard',
    tags: ['ISACA', 'CGEIT'],
    options: [
      { text: '$650 USD', isCorrect: true },
      { text: '$575 USD', isCorrect: false },
      { text: '$595 USD', isCorrect: false },
      { text: '$750 USD', isCorrect: false },
    ],
  },

  // ── EC-Council ────────────────────────────────────────────────────────────
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'What does CEH stand for?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['EC-Council', 'CEH'],
    options: [
      { text: 'Certified Ethical Hacker', isCorrect: true },
      { text: 'Certified Enterprise Hacker', isCorrect: false },
      { text: 'Cyber Ethical Hacker', isCorrect: false },
      { text: 'Certified Expert Hacker', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CEH certification?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['EC-Council', 'CEH'],
    options: [
      { text: '$100 USD', isCorrect: true },
      { text: '$250 USD', isCorrect: false },
      { text: '$500 USD', isCorrect: false },
      { text: '$150 USD', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for the CEH exam?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['EC-Council', 'CEH'],
    options: [
      { text: '1 hour', isCorrect: true },
      { text: '2 hours', isCorrect: false },
      { text: '4 hours', isCorrect: false },
      { text: '30 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'What does CND stand for in EC-Council certifications?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['EC-Council', 'CND'],
    options: [
      { text: 'Certified Network Defender', isCorrect: true },
      { text: 'Certified Network Developer', isCorrect: false },
      { text: 'Cyber Network Defense', isCorrect: false },
      { text: 'Certified Network Director', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CND (Certified Network Defender) certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['EC-Council', 'CND'],
    options: [
      { text: '$500 USD (approx. ₹40,000 INR)', isCorrect: true },
      { text: '$100 USD', isCorrect: false },
      { text: '$250 USD', isCorrect: false },
      { text: '$750 USD', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'What is the passing percentage for the CND exam?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['EC-Council', 'CND'],
    options: [
      { text: '70%', isCorrect: true },
      { text: '60%', isCorrect: false },
      { text: '75%', isCorrect: false },
      { text: '80%', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'How many total questions are in the CND exam?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['EC-Council', 'CND'],
    options: [
      { text: '100 questions', isCorrect: true },
      { text: '65 questions', isCorrect: false },
      { text: '75 questions', isCorrect: false },
      { text: '150 questions', isCorrect: false },
    ],
  },
  {
    topic: 'EC-Council Certifications',
    type: 'MCQ',
    text: 'Which exam body conducts EC-Council certification exams?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['EC-Council'],
    options: [
      { text: 'Pearson VUE', isCorrect: true },
      { text: 'PSI', isCorrect: false },
      { text: 'Kryterion', isCorrect: false },
      { text: 'Prometric', isCorrect: false },
    ],
  },

  // ── CompTIA ───────────────────────────────────────────────────────────────
  {
    topic: 'CompTIA Certifications',
    type: 'MCQ',
    text: 'What is the exam duration for all CompTIA certification exams?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['CompTIA'],
    options: [
      { text: '90 minutes', isCorrect: true },
      { text: '60 minutes', isCorrect: false },
      { text: '120 minutes', isCorrect: false },
      { text: '45 minutes', isCorrect: false },
    ],
  },
  {
    topic: 'CompTIA Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for CompTIA Security+?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['CompTIA', 'Security+'],
    options: [
      { text: '$370 USD', isCorrect: true },
      { text: '$232 USD', isCorrect: false },
      { text: '$338 USD', isCorrect: false },
      { text: '$320 USD', isCorrect: false },
    ],
  },
  {
    topic: 'CompTIA Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for CompTIA A+?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['CompTIA', 'A+'],
    options: [
      { text: '$232 USD', isCorrect: true },
      { text: '$126 USD', isCorrect: false },
      { text: '$338 USD', isCorrect: false },
      { text: '$370 USD', isCorrect: false },
    ],
  },
  {
    topic: 'CompTIA Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for CompTIA Network+?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['CompTIA', 'Network+'],
    options: [
      { text: '$338 USD', isCorrect: true },
      { text: '$232 USD', isCorrect: false },
      { text: '$370 USD', isCorrect: false },
      { text: '$126 USD', isCorrect: false },
    ],
  },
  {
    topic: 'CompTIA Certifications',
    type: 'MCQ',
    text: 'Which exam body conducts CompTIA certification exams?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['CompTIA'],
    options: [
      { text: 'Pearson VUE', isCorrect: true },
      { text: 'PSI', isCorrect: false },
      { text: 'Kryterion', isCorrect: false },
      { text: 'Prometric', isCorrect: false },
    ],
  },

  // ── SCRUM ─────────────────────────────────────────────────────────────────
  {
    topic: 'SCRUM Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CSM (Certified Scrum Master) certification?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['SCRUM', 'CSM'],
    options: [
      { text: '$150 USD', isCorrect: true },
      { text: '$100 USD', isCorrect: false },
      { text: '$200 USD', isCorrect: false },
      { text: '$250 USD', isCorrect: false },
    ],
  },
  {
    topic: 'SCRUM Certifications',
    type: 'MCQ',
    text: 'What is the validity period of the CSM (Certified Scrum Master) certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['SCRUM', 'CSM'],
    options: [
      { text: '2 years', isCorrect: true },
      { text: '1 year', isCorrect: false },
      { text: '3 years', isCorrect: false },
      { text: 'Lifetime', isCorrect: false },
    ],
  },
  {
    topic: 'SCRUM Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for PSM Level 2 (Professional Scrum Master Level 2)?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['SCRUM', 'PSM'],
    options: [
      { text: '$250 USD', isCorrect: true },
      { text: '$150 USD', isCorrect: false },
      { text: '$500 USD', isCorrect: false },
      { text: '$300 USD', isCorrect: false },
    ],
  },
  {
    topic: 'SCRUM Certifications',
    type: 'MCQ',
    text: 'What is the exam mode for the CSM (Certified Scrum Master) exam?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['SCRUM', 'CSM'],
    options: [
      { text: 'Non-Proctor', isCorrect: true },
      { text: 'Proctor', isCorrect: false },
      { text: 'Both Proctor and Non-Proctor', isCorrect: false },
      { text: 'Online proctored only', isCorrect: false },
    ],
  },

  // ── Cisco ─────────────────────────────────────────────────────────────────
  {
    topic: 'Cisco Certifications',
    type: 'MCQ',
    text: 'What does CCNA stand for?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['Cisco', 'CCNA'],
    options: [
      { text: 'Cisco Certified Network Associate', isCorrect: true },
      { text: 'Cisco Certified Network Administrator', isCorrect: false },
      { text: 'Cisco Certified Network Analyst', isCorrect: false },
      { text: 'Cisco Certified Network Architect', isCorrect: false },
    ],
  },
  {
    topic: 'Cisco Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CCNA certification?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['Cisco', 'CCNA'],
    options: [
      { text: '$325 USD', isCorrect: true },
      { text: '$200 USD', isCorrect: false },
      { text: '$345 USD', isCorrect: false },
      { text: '$150 USD', isCorrect: false },
    ],
  },
  {
    topic: 'Cisco Certifications',
    type: 'MCQ',
    text: 'What is the exam fee for the CCNP (Cisco Certified Network Professional)?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['Cisco', 'CCNP'],
    options: [
      { text: '$345 USD', isCorrect: true },
      { text: '$325 USD', isCorrect: false },
      { text: '$400 USD', isCorrect: false },
      { text: '$250 USD', isCorrect: false },
    ],
  },

  // ── ITIL / Axelos ─────────────────────────────────────────────────────────
  {
    topic: 'ITIL & Axelos',
    type: 'MCQ',
    text: 'What does ITIL stand for?',
    marks: 2,
    difficulty: 'Easy',
    tags: ['ITIL', 'Axelos'],
    options: [
      { text: 'IT Infrastructure Library', isCorrect: true },
      { text: 'IT Integration Library', isCorrect: false },
      { text: 'Information Technology Industry Library', isCorrect: false },
      { text: 'IT Implementation Library', isCorrect: false },
    ],
  },
  {
    topic: 'ITIL & Axelos',
    type: 'MCQ',
    text: 'How many levels does the ITIL certification framework have?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ITIL'],
    options: [
      { text: '5 levels', isCorrect: true },
      { text: '3 levels', isCorrect: false },
      { text: '4 levels', isCorrect: false },
      { text: '6 levels', isCorrect: false },
    ],
  },
  {
    topic: 'ITIL & Axelos',
    type: 'MCQ',
    text: 'What is the exam fee for ITIL certification (in GBP)?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['ITIL', 'Axelos'],
    options: [
      { text: '£245 UK Pounds', isCorrect: true },
      { text: '£345 UK Pounds', isCorrect: false },
      { text: '£150 UK Pounds', isCorrect: false },
      { text: '£195 UK Pounds', isCorrect: false },
    ],
  },
  {
    topic: 'ITIL & Axelos',
    type: 'MCQ',
    text: 'What is the passing percentage for PRINCE2 Foundation exam?',
    marks: 2,
    difficulty: 'Hard',
    tags: ['PRINCE2', 'Axelos'],
    options: [
      { text: '65%', isCorrect: true },
      { text: '70%', isCorrect: false },
      { text: '55%', isCorrect: false },
      { text: '75%', isCorrect: false },
    ],
  },
  {
    topic: 'ITIL & Axelos',
    type: 'MCQ',
    text: 'What is the exam fee for PRINCE2 certification (in GBP)?',
    marks: 2,
    difficulty: 'Medium',
    tags: ['PRINCE2', 'Axelos'],
    options: [
      { text: '£345 UK Pounds', isCorrect: true },
      { text: '£245 UK Pounds', isCorrect: false },
      { text: '£195 UK Pounds', isCorrect: false },
      { text: '£450 UK Pounds', isCorrect: false },
    ],
  },
];

async function main() {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected!\n');

  // Find an admin user to be the creator
  const adminUser = await User.findOne({ role: { $in: ['admin', 'Admin', 'ADMIN'] } }).lean();
  if (!adminUser) {
    console.error('❌ No admin user found. Please ensure an admin user exists.');
    process.exit(1);
  }
  console.log(`👤 Using admin user: ${adminUser.fullName || adminUser.email}`);

  // Insert all questions
  console.log(`\n📝 Inserting ${QUESTIONS.length} questions...`);
  const createdQuestions = [];

  for (const q of QUESTIONS) {
    const question = await TestQuestion.create({
      ...q,
      createdBy: adminUser._id,
    });
    createdQuestions.push(question._id);
    process.stdout.write('.');
  }
  console.log(`\n✅ ${createdQuestions.length} questions created!\n`);

  // Total marks = 50 questions × 2 marks = 100
  // Passing = 85% of 100 = 85
  const TOTAL_MARKS = 100;
  const PASSING_PERCENT = 85;
  const PASSING_SCORE = Math.ceil((PASSING_PERCENT / 100) * TOTAL_MARKS); // 85

  // Create the test
  const test = await Test.create({
    title: 'IT Certification Sales Induction Test',
    description:
      'A 50-question MCQ test covering AWS, PMI, ISACA, EC-Council, CompTIA, SCRUM, Cisco, and ITIL/Axelos certifications. Each question carries 2 marks. Duration: 30 minutes. Passing score: 85%.',
    durationMinutes: 30,
    shuffleQuestions: true,
    shuffleOptions: true,
    violationThreshold: 3,
    passingScore: PASSING_SCORE,
    questions: createdQuestions,
    createdBy: adminUser._id,
  });

  console.log('🎉 TEST CREATED SUCCESSFULLY!');
  console.log('──────────────────────────────────────────');
  console.log(`📋 Title      : ${test.title}`);
  console.log(`🆔 Test ID    : ${test._id}`);
  console.log(`⏱  Duration   : ${test.durationMinutes} minutes`);
  console.log(`❓ Questions  : ${createdQuestions.length}`);
  console.log(`💯 Total Marks: ${TOTAL_MARKS}`);
  console.log(`✅ Passing    : ${PASSING_SCORE} / ${TOTAL_MARKS} (${PASSING_PERCENT}%)`);
  console.log('──────────────────────────────────────────');
  console.log('\n✅ Done! You can now assign the test from the Test Assignments page.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
