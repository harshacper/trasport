const db = require('./server/db');
const auth = require('./server/auth');

async function test() {
  console.log("⚙️ Running Complete Supabase SQL Database Verification Suite...");
  
  try {
    const timestamp = Date.now();
    const email = `test_${timestamp}@transport.com`;
    
    // 1. Create User
    console.log("\n🟢 Step 1: Testing User Model...");
    const userPass = await auth.hashPassword('test123');
    const user = await db.User.create({
      email,
      password: userPass,
      role: 'driver'
    });
    console.log("✅ User created successfully:", user);

    // 2. Create Driver
    console.log("\n🟢 Step 2: Testing Driver Model...");
    const driver = await db.Driver.create({
      userId: user.id,
      driverName: 'Test Driver',
      phone: '9999999999',
      email: email,
      licenseNumber: 'TEST-DL-1234',
      aadhaarNumber: '1111-2222-3333',
      vehicleNumber: 'KA-01-AB-9999',
      vehicleType: '10 Ton Truck',
      vehicleCapacity: 10,
      status: 'Available',
      currentLocation: { lat: 12.9716, lng: 77.5946, name: 'Bengaluru' }
    });
    console.log("✅ Driver created successfully:", driver);

    // 3. Create Load (using modern nested JSONB columns matching frontend payload)
    console.log("\n🟢 Step 3: Testing Load Creation (JSONB Columns matching frontend)...");
    const load = await db.Load.create({
      companyId: user.id,
      pickup: { location: 'Bengaluru', address: 'MG Road', date: '2026-08-15', time: '10:00 AM' },
      delivery: { location: 'Mysuru', address: 'Ooty Road', expectedDate: '2026-08-16' },
      goods: { name: 'Cardboard boxes', weight: 5, packages: '50 Boxes', description: 'Fragile goods' },
      vehicleRequirement: { type: '6 Ton Truck', capacity: 6 },
      payment: { offeredPrice: 12000, priceType: 'Fixed' },
      additionalInfo: { specialInstructions: 'Keep away from moisture', loadingAssistance: true, unloadingAssistance: true },
      status: 'POSTED'
    });
    console.log("✅ Load created successfully:", load);

    // 4. Concurrency Lock check on Load
    console.log("\n🟢 Step 4: Testing Concurrency Lock (Atomic Update)...");
    const lockResult = await db.Load.findOneAndUpdate(
      { id: load.id, status: 'POSTED' },
      { status: 'DRIVER_ASSIGNED', driverId: user.id }
    );
    if (!lockResult) {
      throw new Error("Atomic status lock update returned null!");
    }
    console.log("✅ Concurrency Lock lockResult returned:", lockResult);

    // 5. Delete test data
    console.log("\n🟢 Step 5: Cleaning up test data...");
    await db.User.deleteOne({ id: user.id });
    console.log("✅ Test User and cascade dependencies cleaned up successfully.");
    
    console.log("\n🏁 Supabase SQL Database Verification Suite Completed Successfully!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Verification failed:", err);
    process.exit(1);
  }
}

test();
