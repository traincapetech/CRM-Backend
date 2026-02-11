const Lead = require("../models/Lead");
const Employee = require("../models/Employee");
const ActionItem = require("../models/ActionItem");
const User = require("../models/User");
const Sale = require("../models/Sale");

// Hardcoded App Pages
// In a real app, this might come from a config or database
const APP_PAGES = [
  {
    title: "Dashboard",
    link: "/dashboard",
    keywords: ["home", "main", "admin"],
  },
  { title: "Leads", link: "/leads", keywords: ["prospects", "sales"] },
  {
    title: "Employees",
    link: "/employees",
    keywords: ["staff", "workers", "hr"],
  },
  { title: "My Profile", link: "/profile", keywords: ["account", "settings"] },
  {
    title: "Leave Requests",
    link: "/leaves",
    keywords: ["vacation", "time off", "holiday"],
  },
  {
    title: "Careers",
    link: "https://www.traincapetech.in/Career-details",
    keywords: ["jobs", "hiring"],
  },
  { title: "IT Assets", link: "/it-projects", keywords: ["laptop", "devices"] },
];

exports.globalSearch = async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.status(200).json({ success: true, results: [] });
    }

    // Escape special chars to prevent regex errors
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedQuery, "i"); // Case-insensitive regex
    const results = [];

    // 1. Search Pages (In-Memory)
    const pageMatches = APP_PAGES.filter(
      (page) =>
        regex.test(page.title) || page.keywords.some((k) => regex.test(k)),
    ).map((page) => ({
      type: "PAGE",
      title: page.title,
      subtitle: "Go to Page",
      link: page.link,
      id: page.link, // Use link as ID for pages
    }));
    results.push(...pageMatches);

    // 2. Parallel Database Queries
    const [leads, employees, actionItems] = await Promise.all([
      // LEADS: Search Name, Company
      Lead.find({
        $or: [{ name: regex }, { company: regex }],
      })
        .select("name company _id")
        .limit(5)
        .lean(),

      // EMPLOYEES: Search Name, Email
      Employee.find({
        $or: [{ fullName: regex }, { email: regex }],
      })
        .select("fullName email _id role")
        .populate("role", "name")
        .limit(5)
        .lean(),

      // ACTION ITEMS: Search Title (Only for current user)
      ActionItem.find({
        userId: req.user._id,
        title: regex,
        isActioned: false,
      })
        .select("title subtitle _id module priority")
        .limit(5)
        .lean(),
    ]);

    // 3. Format Lead Results (with Sale lookup)
    const leadResults = await Promise.all(
      leads.map(async (lead) => {
        let link = `/lead/${lead._id}`;
        let type = "LEAD";
        let subtitle = lead.company || "Lead";

        // If converted, try to find the linked sale
        // Matching strictly by Name or Email/Phone if available (though encrypted)
        // Since we don't hold a direct reference, we rely on the name match for now as a heuristic
        // Ideally, Lead should store saleId after conversion.
        if (lead.status === "Converted") {
          const sale = await Sale.findOne({
            customerName: lead.name,
            // optional: add more criteria if possible
          })
            .select("_id")
            .lean();

          if (sale) {
            link = `/sale/${sale._id}`;
            type = "SALE"; // Or keep as LEAD but with sale link? Let's use SALE to be clear or maybe not confuse UI icons.
            // Keeping type as LEAD for icon consistency, but link changes.
            // Or change subtitle to indicate it's a sale.
            subtitle = "Converted to Sale";
          }
        }

        return {
          type: "LEAD", // Keep icon as Lead
          title: lead.name,
          subtitle: subtitle,
          link: link,
          id: lead._id,
        };
      }),
    );
    results.push(...leadResults);

    // 4. Format Employee Results
    employees.forEach((emp) => {
      results.push({
        type: "EMPLOYEE",
        title: emp.fullName,
        subtitle: emp.role?.name || emp.email,
        link: `/employees?id=${emp._id}`,
        id: emp._id,
      });
    });

    // 5. Format Action Item Results
    actionItems.forEach((action) => {
      results.push({
        type: "ACTION",
        title: action.title,
        subtitle: action.subtitle || `${action.module} Task`,
        link: `/feed?action=${action._id}`, // Or trigger action directly
        id: action._id,
        meta: { priority: action.priority },
      });
    });

    // Sort by relevance? For now, we just return mixed list.
    // Maybe prioritize exact matches or specific types.

    res
      .status(200)
      .json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ success: false, error: "Server Error" });
  }
};
