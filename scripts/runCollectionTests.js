const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Sale = require('../models/Sale');
const SaleCollectionAssignment = require('../models/SaleCollectionAssignment');
const collectionService = require('../services/collectionService');

async function runTests() {
  console.log('Connecting to MongoDB for Collection Ownership verification...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('MongoDB connected successfully.');

  const now = Date.now();
  const rahul = await User.create({
    fullName: 'Rahul Salesman',
    email: `test_rahul_${now}@test.com`,
    password: 'password123',
    role: 'Sales Person',
    status: 'Active',
  });
  const amit = await User.create({
    fullName: 'Amit Collector',
    email: `test_amit_${now}@test.com`,
    password: 'password123',
    role: 'Sales Person',
    status: 'Active',
  });
  const priya = await User.create({
    fullName: 'Priya Collector',
    email: `test_priya_${now}@test.com`,
    password: 'password123',
    role: 'Sales Person',
    status: 'Active',
  });
  const admin = await User.create({
    fullName: 'Admin Test',
    email: `test_admin_${now}@test.com`,
    password: 'password123',
    role: 'Admin',
    status: 'Active',
  });
  const divyam = await User.create({
    fullName: 'Divyam Closer',
    email: `test_divyam_${now}@test.com`,
    password: 'password123',
    role: 'Sales Person',
    status: 'Active',
  });
  const ningshen = await User.create({
    fullName: 'Ningshen Collector',
    email: `test_ningshen_${now}@test.com`,
    password: 'password123',
    role: 'Sales Person',
    status: 'Active',
  });

  const rahulId = rahul._id;
  const amitId = amit._id;
  const priyaId = priya._id;
  const adminId = admin._id;
  const divyamId = divyam._id;
  const ningshenId = ningshen._id;

  const createdSaleIds = [];
  const createdUserIds = [rahulId, amitId, priyaId, adminId, divyamId, ningshenId];

  try {
    console.log('\n========================================');
    console.log('STARTING AUTOMATED COLLECTION TESTS (1 - 10)');
    console.log('========================================\n');

    // ----------------------------------------------------
    // TEST 1:
    // Rahul sale = $500, Paid = $250, Pending = $250, No collection owner
    // Expected: Rahul revenue = $500, Pending = $250
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 1 ---');
    const sale1 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: rahulId,
      totalCost: 500,
      tokenAmount: 250,
      amount: 500,
      token: 250,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await sale1.save();
    createdSaleIds.push(sale1._id);

    // Check Rahul revenue and pending
    const rahulSalesT1 = await Sale.find({ salesPerson: rahulId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const rahulRevenueT1 = rahulSalesT1.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const sale1Pending = sale1.totalCost - sale1.tokenAmount;

    console.log(`Rahul Revenue: $${rahulRevenueT1} (Expected: $500)`);
    console.log(`Sale 1 Pending: $${sale1Pending} (Expected: $250)`);
    console.log(`Sale 1 Collection Owners: ${sale1.currentCollectionOwners.length} (Expected: 0)`);
    if (rahulRevenueT1 !== 500 || sale1Pending !== 250 || sale1.currentCollectionOwners.length !== 0) {
      throw new Error('TEST 1 FAILED');
    }
    console.log('✓ TEST 1 PASSED\n');

    // ----------------------------------------------------
    // TEST 2:
    // Assign $250 collection to Amit
    // Expected: Rahul revenue = $500, Amit sales revenue = $0, Amit collection assigned = $250, Amit collection remaining = $250
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 2 ---');
    const assignResT2 = await collectionService.assignCollection({
      saleId: sale1._id,
      assignments: [{ assignedTo: amitId, assignedAmount: 250 }],
      assignedBy: adminId,
      userRole: 'Admin',
    });

    const updatedSale1T2 = await Sale.findById(sale1._id);
    const amitSalesT2 = await Sale.find({ salesPerson: amitId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const amitSalesRevenueT2 = amitSalesT2.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const rahulSalesT2 = await Sale.find({ salesPerson: rahulId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const rahulRevenueT2 = rahulSalesT2.reduce((sum, s) => sum + (s.totalCost || 0), 0);

    const amitPerfT2 = await collectionService.getCollectionPerformance({ userId: amitId });

    console.log(`Rahul Revenue: $${rahulRevenueT2} (Expected: $500)`);
    console.log(`Amit Sales Revenue: $${amitSalesRevenueT2} (Expected: $0)`);
    console.log(`Amit Collection Assigned: $${amitPerfT2.kpis.totalAssigned} (Expected: $250)`);
    console.log(`Amit Collection Remaining: $${amitPerfT2.kpis.totalRemaining} (Expected: $250)`);

    if (
      rahulRevenueT2 !== 500 ||
      amitSalesRevenueT2 !== 0 ||
      amitPerfT2.kpis.totalAssigned !== 250 ||
      amitPerfT2.kpis.totalRemaining !== 250
    ) {
      throw new Error('TEST 2 FAILED');
    }
    console.log('✓ TEST 2 PASSED\n');

    // ----------------------------------------------------
    // TEST 3:
    // Amit collects final $250
    // Expected: Sale status = Complete, Pending = $0, Rahul revenue = $500, Amit sales revenue = $0, Amit collection collected = $250, Amit collection remaining = $0
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 3 ---');
    const assignmentT2 = (assignResT2.assignments || assignResT2)[0];
    await collectionService.recordCollectionPayment({
      assignmentId: assignmentT2._id,
      amount: 250,
      collectedBy: amitId,
      notes: 'Final payment received in full',
    });

    const updatedSale1T3 = await Sale.findById(sale1._id);
    const rahulSalesT3 = await Sale.find({ salesPerson: rahulId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const rahulRevenueT3 = rahulSalesT3.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const amitSalesT3 = await Sale.find({ salesPerson: amitId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const amitSalesRevenueT3 = amitSalesT3.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const amitPerfT3 = await collectionService.getCollectionPerformance({ userId: amitId });
    const sale1PendingT3 = updatedSale1T3.status === 'Completed' ? 0 : (updatedSale1T3.totalCost - updatedSale1T3.tokenAmount);

    console.log(`Sale 1 Status: ${updatedSale1T3.status} (Expected: Completed)`);
    console.log(`Sale 1 Pending: $${sale1PendingT3} (Expected: $0)`);
    console.log(`Rahul Revenue: $${rahulRevenueT3} (Expected: $500)`);
    console.log(`Amit Sales Revenue: $${amitSalesRevenueT3} (Expected: $0)`);
    console.log(`Amit Collection Collected: $${amitPerfT3.kpis.totalCollected} (Expected: $250)`);
    console.log(`Amit Collection Remaining: $${amitPerfT3.kpis.totalRemaining} (Expected: $0)`);

    if (
      updatedSale1T3.status !== 'Completed' ||
      sale1PendingT3 !== 0 ||
      rahulRevenueT3 !== 500 ||
      amitSalesRevenueT3 !== 0 ||
      amitPerfT3.kpis.totalCollected !== 250 ||
      amitPerfT3.kpis.totalRemaining !== 0
    ) {
      throw new Error('TEST 3 FAILED');
    }
    console.log('✓ TEST 3 PASSED\n');

    // ----------------------------------------------------
    // TEST 4:
    // Outstanding = $10,000
    // Assign: Amit = $6,000, Priya = $4,000
    // Expected: Total assigned = $10,000, No validation error.
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 4 ---');
    const sale2 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: rahulId,
      totalCost: 10000,
      tokenAmount: 0,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await sale2.save();
    createdSaleIds.push(sale2._id);

    const assignResT4 = await collectionService.assignCollection({
      saleId: sale2._id,
      assignments: [
        { assignedTo: amitId, assignedAmount: 6000 },
        { assignedTo: priyaId, assignedAmount: 4000 },
      ],
      assignedBy: adminId,
      userRole: 'Admin',
    });

    const updatedSale2T4 = await Sale.findById(sale2._id);
    console.log(`Total Collection Assigned on Sale 2: $${updatedSale2T4.totalCollectionAssigned} (Expected: $10000)`);
    console.log(`Collection Owners count: ${updatedSale2T4.currentCollectionOwners.length} (Expected: 2)`);
    console.log(`Collection Status: ${updatedSale2T4.collectionStatus} (Expected: ASSIGNED)`);

    if (
      updatedSale2T4.totalCollectionAssigned !== 10000 ||
      updatedSale2T4.currentCollectionOwners.length !== 2 ||
      updatedSale2T4.collectionStatus !== 'ASSIGNED'
    ) {
      throw new Error('TEST 4 FAILED');
    }
    console.log('✓ TEST 4 PASSED\n');

    // ----------------------------------------------------
    // TEST 5:
    // Outstanding = $10,000
    // Attempt: Amit = $7,000, Priya = $5,000 (Total = $12,000)
    // Expected: Reject because total assignment exceeds outstanding amount.
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 5 ---');
    const sale3 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: rahulId,
      totalCost: 10000,
      tokenAmount: 0,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await sale3.save();
    createdSaleIds.push(sale3._id);

    let test5Rejected = false;
    try {
      await collectionService.assignCollection({
        saleId: sale3._id,
        assignments: [
          { assignedTo: amitId, assignedAmount: 7000 },
          { assignedTo: priyaId, assignedAmount: 5000 },
        ],
        assignedBy: adminId,
        userRole: 'Admin',
      });
    } catch (err) {
      test5Rejected = true;
      console.log(`Correctly rejected with error: "${err.message}"`);
    }

    if (!test5Rejected) {
      throw new Error('TEST 5 FAILED: Expected assignment > outstanding to be rejected, but it succeeded!');
    }
    console.log('✓ TEST 5 PASSED\n');

    // ----------------------------------------------------
    // TEST 6:
    // Amit has $10,000 collection responsibility.
    // Amit becomes unavailable.
    // Reassign: Amit → Priya
    // Expected: Original sales owner unchanged, Amit remains in historical collection assignment, Priya becomes current collection owner, audit entry created.
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 6 ---');
    const sale4 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: rahulId,
      totalCost: 10000,
      tokenAmount: 0,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await sale4.save();
    createdSaleIds.push(sale4._id);

    const assignResT6 = await collectionService.assignCollection({
      saleId: sale4._id,
      assignments: [{ assignedTo: amitId, assignedAmount: 10000 }],
      assignedBy: adminId,
      userRole: 'Admin',
    });

    const amitAssignmentT6 = (assignResT6.assignments || assignResT6)[0];

    // Reassign Amit -> Priya
    const reassignResT6 = await collectionService.reassignCollection({
      assignmentId: amitAssignmentT6._id,
      newAssignedTo: priyaId,
      reassignmentReason: 'Employee left company',
      reassignedBy: adminId,
      notes: 'Handover to Priya',
    });

    const updatedSale4T6 = await Sale.findById(sale4._id);
    const historicalAmit = await SaleCollectionAssignment.findById(amitAssignmentT6._id);
    const newPriyaAssignment = await SaleCollectionAssignment.findById(reassignResT6.newAssignment._id);

    console.log(`Original Sales Owner: ${updatedSale4T6.salesPerson.toString()} (Expected: ${rahulId.toString()})`);
    console.log(`Amit Historical Status: ${historicalAmit.status} (Expected: REASSIGNED)`);
    console.log(`Amit Reassignment Reason: "${historicalAmit.reassignmentReason}" (Expected: "Employee left company")`);
    console.log(`Priya New Assignment Status: ${newPriyaAssignment.status} (Expected: ACTIVE)`);
    console.log(`Current Collection Owners count: ${updatedSale4T6.currentCollectionOwners.length} (Expected: 1)`);
    console.log(`Current Collection Owner: ${updatedSale4T6.currentCollectionOwners[0].toString()} (Expected: ${priyaId.toString()})`);

    if (
      updatedSale4T6.salesPerson.toString() !== rahulId.toString() ||
      historicalAmit.status !== 'REASSIGNED' ||
      historicalAmit.reassignmentReason !== 'Employee left company' ||
      newPriyaAssignment.status !== 'ACTIVE' ||
      updatedSale4T6.currentCollectionOwners[0].toString() !== priyaId.toString()
    ) {
      throw new Error('TEST 6 FAILED');
    }
    console.log('✓ TEST 6 PASSED\n');

    // ----------------------------------------------------
    // TEST 7:
    // Amit had collected $6,000 before reassignment and $4,000 remains.
    // Reassign remainder to Priya.
    // Expected:
    // Historical collection: Amit collected = $6,000
    // New assignment: Priya remaining = $4,000
    // Do not turn Amit's historical collection into Priya's collection.
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 7 ---');
    const sale5 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: rahulId,
      totalCost: 10000,
      tokenAmount: 0,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await sale5.save();
    createdSaleIds.push(sale5._id);

    const assignResT7 = await collectionService.assignCollection({
      saleId: sale5._id,
      assignments: [{ assignedTo: amitId, assignedAmount: 10000 }],
      assignedBy: adminId,
      userRole: 'Admin',
    });

    const amitAssignmentT7 = (assignResT7.assignments || assignResT7)[0];

    // Amit collects $6,000
    await collectionService.recordCollectionPayment({
      assignmentId: amitAssignmentT7._id,
      amount: 6000,
      collectedBy: amitId,
      notes: 'Partial payment collected by Amit',
    });

    // Reassign remaining $4,000 to Priya
    const reassignResT7 = await collectionService.reassignCollection({
      assignmentId: amitAssignmentT7._id,
      newAssignedTo: priyaId,
      reassignmentReason: 'Reassigning balance after partial collection',
      reassignedBy: adminId,
    });

    const amitHistT7 = await SaleCollectionAssignment.findById(amitAssignmentT7._id);
    const priyaNewT7 = await SaleCollectionAssignment.findById(reassignResT7.newAssignment._id);

    console.log(`Amit Historical Collected: $${amitHistT7.collectedAmount} (Expected: $6000)`);
    console.log(`Amit Historical Status: ${amitHistT7.status} (Expected: REASSIGNED)`);
    console.log(`Priya Assigned Amount: $${priyaNewT7.assignedAmount} (Expected: $4000)`);
    console.log(`Priya Collected Amount: $${priyaNewT7.collectedAmount} (Expected: $0)`);
    console.log(`Priya Remaining Amount: $${priyaNewT7.remainingAmount} (Expected: $4000)`);

    if (
      amitHistT7.collectedAmount !== 6000 ||
      amitHistT7.status !== 'REASSIGNED' ||
      priyaNewT7.assignedAmount !== 4000 ||
      priyaNewT7.collectedAmount !== 0 ||
      priyaNewT7.remainingAmount !== 4000
    ) {
      throw new Error('TEST 7 FAILED');
    }
    console.log('✓ TEST 7 PASSED\n');

    // ----------------------------------------------------
    // TEST 8:
    // Two different sales:
    // Sale A: Sales Owner = Rahul, Collection Owner = Amit
    // Sale B: Sales Owner = Priya, Collection Owner = Amit
    // Collection dashboard for Amit should aggregate both collection assignments
    // while Sales Revenue should still attribute each sale to its original sales owner.
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 8 ---');
    const saleA = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: rahulId,
      totalCost: 1500,
      tokenAmount: 500,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleA.save();
    createdSaleIds.push(saleA._id);

    const saleB = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION__',
      course: 'PMP',
      country: 'India',
      salesPerson: priyaId,
      totalCost: 2000,
      tokenAmount: 800,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleB.save();
    createdSaleIds.push(saleB._id);

    // Assign pending balance of Sale A ($1,000) and Sale B ($1,200) to Amit
    await collectionService.assignCollection({
      saleId: saleA._id,
      assignments: [{ assignedTo: amitId, assignedAmount: 1000 }],
      assignedBy: adminId,
      userRole: 'Admin',
    });

    await collectionService.assignCollection({
      saleId: saleB._id,
      assignments: [{ assignedTo: amitId, assignedAmount: 1200 }],
      assignedBy: adminId,
      userRole: 'Admin',
    });

    // Check sales revenue attribution
    const rahulSalesT8 = await Sale.find({ salesPerson: rahulId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const rahulRevT8 = rahulSalesT8.reduce((s, x) => s + (x.totalCost || 0), 0);

    const priyaSalesT8 = await Sale.find({ salesPerson: priyaId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const priyaRevT8 = priyaSalesT8.reduce((s, x) => s + (x.totalCost || 0), 0);

    const amitSalesT8 = await Sale.find({ salesPerson: amitId, customerName: '__TEST_COLLECTION_AUTOMATION__' });
    const amitRevT8 = amitSalesT8.reduce((s, x) => s + (x.totalCost || 0), 0);

    // Amit collection dashboard
    const amitPerfT8 = await collectionService.getCollectionPerformance({ userId: amitId });

    console.log(`Rahul Total Sales Revenue: $${rahulRevT8} (includes Sale 1 $500, Sale 2 $10000, Sale 3 $10000, Sale 4 $10000, Sale 5 $10000, Sale A $1500)`);
    console.log(`Priya Total Sales Revenue: $${priyaRevT8} (Sale B $2000)`);
    console.log(`Amit Total Sales Revenue: $${amitRevT8} (Expected: $0)`);
    console.log(`Amit Collection Assigned on Sale A ($1,000) + Sale B ($1,200) + previous active assignments:`);
    console.log(`Amit Collection Performance Active Remaining: $${amitPerfT8.kpis.totalRemaining}`);

    // Verify Amit has $0 sales revenue
    if (amitRevT8 !== 0) {
      throw new Error(`TEST 8 FAILED: Amit was credited $${amitRevT8} in sales revenue, expected $0!`);
    }

    // Verify Sale A still belongs to Rahul and Sale B belongs to Priya
    const verifySaleA = await Sale.findById(saleA._id);
    const verifySaleB = await Sale.findById(saleB._id);
    if (
      verifySaleA.salesPerson.toString() !== rahulId.toString() ||
      verifySaleB.salesPerson.toString() !== priyaId.toString()
    ) {
      throw new Error('TEST 8 FAILED: Sales ownership was corrupted!');
    }

    console.log('✓ TEST 8 PASSED\n');

    // ----------------------------------------------------
    // TEST 9:
    // BULK ASSIGN DIVYAM'S PENDING SALES TO NINGSHEN
    // - Divyam closes 3 deals with pending balances:
    //   * Sale D1: Amount $2000, Token $500, Pending $1500
    //   * Sale D2: Amount $1200, Token $400, Pending $800
    //   * Sale D3: Amount $800, Token $300, Pending $500
    //   Total Divyam Sales Closed: $4,000. Total Pending: $2,800.
    // - Verify getBulkPreview returns 3 pending sales, total pending $2800.
    // - Admin assigns all Divyam pending sales at once to Ningshen.
    // - Verification:
    //   1. Divyam's historical sales revenue is 100% intact ($4,000).
    //   2. Ningshen's sales revenue is strictly $0.
    //   3. All 3 deals have active collection assignment to Ningshen for the respective pending amounts.
    //   4. Ningshen's collection quota / performance reflects $2,800 total pending.
    //   5. Sale.salesPerson remains Divyam on all 3 deals.
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 9: BULK ASSIGN FROM SALESPERSON (DIVYAM -> NINGSHEN) ---');
    const saleD1 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION_BULK__',
      course: 'Data Science',
      country: 'India',
      salesPerson: divyamId,
      totalCost: 2000,
      tokenAmount: 500,
      amount: 2000,
      token: 500,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleD1.save();
    createdSaleIds.push(saleD1._id);

    const saleD2 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION_BULK__',
      course: 'Full Stack',
      country: 'USA',
      salesPerson: divyamId,
      totalCost: 1200,
      tokenAmount: 400,
      amount: 1200,
      token: 400,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleD2.save();
    createdSaleIds.push(saleD2._id);

    const saleD3 = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION_BULK__',
      course: 'AI Master',
      country: 'UK',
      salesPerson: divyamId,
      totalCost: 800,
      tokenAmount: 300,
      amount: 800,
      token: 300,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleD3.save();
    createdSaleIds.push(saleD3._id);

    // 1. Check live preview for Divyam
    const divyamPreview = await collectionService.getBulkPreview({ salesPersonId: divyamId });
    console.log(`Divyam Bulk Preview: count=${divyamPreview.count}, totalPending=$${divyamPreview.totalPendingAmount}`);
    if (divyamPreview.count !== 3 || divyamPreview.totalPendingAmount !== 2800) {
      throw new Error(`TEST 9 FAILED: Preview expected 3 sales and $2800, got ${divyamPreview.count} and $${divyamPreview.totalPendingAmount}`);
    }

    // 2. Perform bulk assignment of all Divyam's pending sales to Ningshen
    const bulkResult = await collectionService.bulkAssignSalesPersonPending({
      salesPersonId: divyamId,
      targetCollectorId: ningshenId,
      reason: "Divyam transitioning pending collections to Ningshen",
      performedBy: adminId,
      userRole: 'Admin',
    });

    console.log(`Bulk Assign Result: successCount=${bulkResult.successCount}, totalAssignedAmount=$${bulkResult.totalAssignedAmount}`);
    if (bulkResult.successCount !== 3 || bulkResult.totalAssignedAmount !== 2800) {
      throw new Error(`TEST 9 FAILED: Expected 3 assignments totaling $2800, got ${bulkResult.successCount} and $${bulkResult.totalAssignedAmount}`);
    }

    // 3. Verify Divyam Sales Revenue is 100% intact ($4,000)
    const divyamSales = await Sale.find({ salesPerson: divyamId, customerName: '__TEST_COLLECTION_AUTOMATION_BULK__' });
    const divyamRevenue = divyamSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    console.log(`Divyam Sales Revenue: $${divyamRevenue} (Expected: $4,000)`);
    if (divyamRevenue !== 4000) {
      throw new Error(`TEST 9 FAILED: Divyam's sales revenue was altered! Expected $4,000, got $${divyamRevenue}`);
    }

    // 4. Verify Ningshen Sales Revenue is strictly $0
    const ningshenSales = await Sale.find({ salesPerson: ningshenId, customerName: '__TEST_COLLECTION_AUTOMATION_BULK__' });
    const ningshenRevenue = ningshenSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    console.log(`Ningshen Sales Revenue: $${ningshenRevenue} (Expected: $0)`);
    if (ningshenRevenue !== 0) {
      throw new Error(`TEST 9 FAILED: Ningshen incorrectly credited with sales revenue! Got $${ningshenRevenue}`);
    }

    // 5. Verify Ningshen Collection Performance KPIs
    const ningshenPerf = await collectionService.getCollectionPerformance({ userId: ningshenId });
    console.log(`Ningshen Collection Assigned Deals: ${ningshenPerf.kpis.activeCount} (Expected: 3)`);
    console.log(`Ningshen Collection Assigned Amount: $${ningshenPerf.kpis.totalRemaining} (Expected: $2,800)`);
    if (ningshenPerf.kpis.activeCount !== 3 || ningshenPerf.kpis.totalRemaining !== 2800) {
      throw new Error('TEST 9 FAILED: Ningshen collection performance KPI mismatch');
    }

    // 6. Verify original salesPerson remains Divyam on each sale document
    const refreshedD1 = await Sale.findById(saleD1._id);
    const refreshedD2 = await Sale.findById(saleD2._id);
    const refreshedD3 = await Sale.findById(saleD3._id);
    if (
      refreshedD1.salesPerson.toString() !== divyamId.toString() ||
      refreshedD2.salesPerson.toString() !== divyamId.toString() ||
      refreshedD3.salesPerson.toString() !== divyamId.toString()
    ) {
      throw new Error('TEST 9 FAILED: Sale.salesPerson was changed during bulk assignment!');
    }
    console.log('✓ TEST 9 PASSED (Divyam -> Ningshen bulk pending assignment)\n');

    // ----------------------------------------------------
    // TEST 10:
    // BULK ASSIGN SELECTED DEALS FROM TABLE TO COLLECTOR
    // - Create two pending sales: Sale T10_A and Sale T10_B
    // - Assign selected [Sale T10_A, Sale T10_B] to Amit
    // - Verify both deals assigned, original salesPerson unchanged
    // ----------------------------------------------------
    console.log('--- RUNNING TEST 10: BULK ASSIGN SELECTED TABLE ROWS ---');
    const saleSelA = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION_SEL__',
      course: 'DevOps',
      country: 'Canada',
      salesPerson: divyamId,
      totalCost: 1500,
      tokenAmount: 500,
      amount: 1500,
      token: 500,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleSelA.save();
    createdSaleIds.push(saleSelA._id);

    const saleSelB = new Sale({
      customerName: '__TEST_COLLECTION_AUTOMATION_SEL__',
      course: 'Cloud Architecture',
      country: 'Germany',
      salesPerson: priyaId,
      totalCost: 1000,
      tokenAmount: 200,
      amount: 1000,
      token: 200,
      status: 'Pending',
      currency: 'USD',
      date: new Date(),
    });
    await saleSelB.save();
    createdSaleIds.push(saleSelB._id);

    const selResult = await collectionService.bulkAssignSelectedSales({
      saleIds: [saleSelA._id, saleSelB._id],
      targetCollectorId: ningshenId,
      reason: 'Batch selected from table checkboxes',
      performedBy: adminId,
      userRole: 'Admin',
    });

    console.log(`Selected Batch Result: successCount=${selResult.successCount}, totalAssignedAmount=$${selResult.totalAssignedAmount}`);
    if (selResult.successCount !== 2 || selResult.totalAssignedAmount !== 1800) {
      throw new Error(`TEST 10 FAILED: Expected 2 assignments totaling $1800, got ${selResult.successCount} and $${selResult.totalAssignedAmount}`);
    }

    const checkSelA = await Sale.findById(saleSelA._id);
    const checkSelB = await Sale.findById(saleSelB._id);
    if (
      checkSelA.salesPerson.toString() !== divyamId.toString() ||
      checkSelB.salesPerson.toString() !== priyaId.toString()
    ) {
      throw new Error('TEST 10 FAILED: Sales ownership altered during selected bulk assignment!');
    }
    console.log('✓ TEST 10 PASSED (Batch assignment of selected table rows)\n');

    console.log('========================================');
    console.log('ALL 10 TEST CASES PASSED SUCCESSFULLY! 🚀');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ TEST RUN ERROR:', error);
    process.exitCode = 1;
  } finally {
    console.log('\nCleaning up test records from database...');
    if (createdSaleIds.length > 0) {
      await Sale.deleteMany({ _id: { $in: createdSaleIds } });
      await SaleCollectionAssignment.deleteMany({ saleId: { $in: createdSaleIds } });
      console.log(`Cleaned up ${createdSaleIds.length} test sales and their collection assignments.`);
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
      console.log(`Cleaned up ${createdUserIds.length} test users.`);
    }
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

runTests();
