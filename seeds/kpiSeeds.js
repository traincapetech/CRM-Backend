/**
 * Seed Data - Default KPI Templates
 * Run this once to populate initial KPI templates for Lead Person and Sales Person
 */

const mongoose = require("mongoose");
const KPIDefinition = require("../models/KPIDefinition");

const defaultKPIs = [
  // Lead Person KPIs
  {
    role: "Lead Person",
    kpiName: "Daily Leads Created",
    description: "Number of new leads created per day",
    metricType: "count",
    frequency: "daily",
    thresholds: {
      minimum: 5,
      target: 8,
      excellent: 12,
    },
    weight: 70,
    dataSource: {
      type: "leads",
      query: {
        collection: "leads",
        dateField: "createdAt",
        userField: "createdBy",
      },
    },
    isActive: true,
  },
  {
    role: "Lead Person",
    kpiName: "Lead Conversion Rate",
    description: "Percentage of leads that convert to sales",
    metricType: "percentage",
    frequency: "monthly",
    thresholds: {
      minimum: 10,
      target: 20,
      excellent: 30,
    },
    weight: 30,
    dataSource: {
      type: "custom",
      query: {
        // Custom calculation: (sales from my leads / total leads) * 100
      },
    },
    isActive: true,
  },

  // Sales Person KPIs
  {
    role: "Sales Person",
    kpiName: "Monthly Sales Closed",
    description: "Number of sales closed per month",
    metricType: "count",
    frequency: "monthly",
    thresholds: {
      minimum: 3,
      target: 6,
      excellent: 10,
    },
    weight: 50,
    dataSource: {
      type: "sales",
      query: {
        collection: "sales",
        dateField: "date",
        userField: "salesPerson",
        statusField: "status",
        statusValue: "closed",
      },
    },
    isActive: true,
  },
  {
    role: "Sales Person",
    kpiName: "Monthly Revenue Generated",
    description: "Total revenue from closed sales per month",
    metricType: "amount",
    frequency: "monthly",
    thresholds: {
      minimum: 5000,
      target: 10000,
      excellent: 20000,
    },
    weight: 50,
    dataSource: {
      type: "sales",
      query: {
        collection: "sales",
        dateField: "date",
        userField: "salesPerson",
        sumField: "finalAmount",
        statusField: "status",
        statusValue: "closed",
      },
    },
    isActive: true,
  },

  // Manager KPIs
  {
    role: "Manager",
    kpiName: "Team Performance Average",
    description: "Average performance score of team members",
    metricType: "percentage",
    frequency: "monthly",
    thresholds: {
      minimum: 60,
      target: 75,
      excellent: 90,
    },
    weight: 60,
    dataSource: {
      type: "custom",
    },
    isActive: true,
  },
  {
    role: "Manager",
    kpiName: "Team Retention Rate",
    description: "Percentage of team members retained (no exits)",
    metricType: "percentage",
    frequency: "monthly",
    thresholds: {
      minimum: 85,
      target: 95,
      excellent: 100,
    },
    weight: 40,
    dataSource: {
      type: "custom",
    },
    isActive: true,
  },
];

// Function to seed KPIs
const seedKPIs = async () => {
  try {
    // Check if KPIs already exist
    const existingCount = await KPIDefinition.countDocuments();

    if (existingCount > 0) {
      console.log(
        `✅ KPIs already seeded (${existingCount} found). Skipping...`,
      );
      return;
    }

    // Insert all KPIs
    const result = await KPIDefinition.insertMany(defaultKPIs);

    console.log(
      `✅ Successfully seeded ${result.length} default KPI templates:`,
    );
    result.forEach((kpi) => {
      console.log(`   - ${kpi.role}: ${kpi.kpiName}`);
    });
  } catch (error) {
    console.error("❌ Error seeding KPIs:", error);
    throw error;
  }
};

module.exports = { defaultKPIs, seedKPIs };
