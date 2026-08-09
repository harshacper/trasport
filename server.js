const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./server/db');
const auth = require('./server/auth');

const app = express();
const server = http.createServer(app);

// Configure Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

app.use(cors());
app.use(express.json());

// Serve static frontend assets from client/dist when built
app.use(express.static(path.join(__dirname, 'client/dist')));

// WebSocket Socket mapping: userId -> socketId
const activeSockets = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  
  socket.on('register_user', (userId) => {
    activeSockets.set(userId, socket.id);
    console.log(`👤 User registered: ${userId} to socket ${socket.id}`);
  });

  socket.on('send_chat_message', async (messageData) => {
    const { tripId, senderId, senderRole, text, type, location } = messageData;
    try {
      const msg = await db.Message.create({
        tripId,
        senderId,
        senderRole,
        text,
        type: type || 'text',
        location: location || null
      });

      // Find the trip to get the recipient ID
      const trip = await db.Trip.findById(tripId);
      if (trip) {
        const recipientId = senderRole === 'company' ? trip.driverId : trip.companyId;
        const recipientSocket = activeSockets.get(recipientId);
        
        if (recipientSocket) {
          io.to(recipientSocket).emit('new_chat_message', msg);
        }
        
        // Also emit back to sender confirm
        socket.emit('new_chat_message', msg);
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  });

  socket.on('disconnect', () => {
    for (let [userId, socketId] of activeSockets.entries()) {
      if (socketId === socket.id) {
        activeSockets.delete(userId);
        console.log(`👤 User logged out/disconnected: ${userId}`);
        break;
      }
    }
  });
});

// Helper: send notification
async function createNotification(userId, role, title, body, type, data = {}) {
  try {
    const notification = await db.Notification.create({
      userId,
      role,
      title,
      body,
      type,
      data
    });
    
    const userSocket = activeSockets.get(userId);
    if (userSocket) {
      io.to(userSocket).emit('notification_received', notification);
    }
    return notification;
  } catch (err) {
    console.error("Notification creation error:", err);
  }
}

// Bengaluru to Mysuru simulated route coordinates
const ROUTE_BENGALURU_MYSURU = [
  { lat: 12.9716, lng: 77.5946, name: "Bengaluru (Pickup)" },
  { lat: 12.8756, lng: 77.4012, name: "Kengeri" },
  { lat: 12.7234, lng: 77.2798, name: "Bidadi" },
  { lat: 12.5221, lng: 77.1755, name: "Ramanagara" },
  { lat: 12.4332, lng: 77.0421, name: "Channapatna" },
  { lat: 12.5218, lng: 76.8974, name: "Maddur" },
  { lat: 12.5222, lng: 76.7198, name: "Mandya" },
  { lat: 12.4215, lng: 76.6982, name: "Srirangapatna" },
  { lat: 12.2958, lng: 76.6394, name: "Mysuru (Destination)" }
];

// Automatically progress transit simulation every 10 seconds for active trips
setInterval(async () => {
  try {
    const activeTrips = await db.Trip.find({ status: 'IN_TRANSIT' });
    for (let trip of activeTrips) {
      let nextIndex = (trip.simulatedRouteIndex || 0) + 1;
      if (nextIndex < ROUTE_BENGALURU_MYSURU.length) {
        const nextCoord = ROUTE_BENGALURU_MYSURU[nextIndex];
        
        await db.Trip.findByIdAndUpdate(trip._id, {
          simulatedRouteIndex: nextIndex,
          $push: { locationLogs: { lat: nextCoord.lat, lng: nextCoord.lng, timestamp: new Date() } }
        });

        // Notify company and driver
        const companySocket = activeSockets.get(trip.companyId);
        const driverSocket = activeSockets.get(trip.driverId);
        
        const trackingUpdate = {
          tripId: trip._id,
          currentLocation: nextCoord,
          index: nextIndex,
          totalPoints: ROUTE_BENGALURU_MYSURU.length,
          distanceRemaining: Math.max(0, 140 - (nextIndex * 16)) // Approx. 140KM total
        };

        if (companySocket) io.to(companySocket).emit('tracking_update', trackingUpdate);
        if (driverSocket) io.to(driverSocket).emit('tracking_update', trackingUpdate);
        
        console.log(`🚛 Trip ${trip._id} simulated location progress to ${nextCoord.name}`);
      } else {
        // Automatically arrive at destination
        await db.Trip.findByIdAndUpdate(trip._id, {
          status: 'ARRIVED_AT_DESTINATION'
        });
        await db.Load.findByIdAndUpdate(trip.loadId, {
          status: 'ARRIVED_AT_DESTINATION'
        });

        await createNotification(trip.companyId, 'company', '🚛 ARRIVED AT DESTINATION', `Your driver has arrived at the destination: Mysuru`, 'TRIP_UPDATE', { tripId: trip._id });
        await createNotification(trip.driverId, 'driver', '🏁 DESTINATION REACHED', `You have arrived at your destination: Mysuru`, 'TRIP_UPDATE', { tripId: trip._id });
        
        io.emit('global_trip_updated');
      }
    }
  } catch (err) {
    console.error("Simulation ticker error:", err);
  }
}, 12000);

// --- REST API ENDPOINTS ---

// 1. Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role, companyDetails, driverDetails } = req.body;
  try {
    const existing = await db.User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await auth.hashPassword(password);
    const user = await db.User.create({
      email,
      password: hashedPassword,
      role
    });

    let profile;
    if (role === 'company') {
      profile = await db.Company.create({
        userId: user._id,
        email: user.email,
        ...companyDetails
      });
    } else if (role === 'driver') {
      profile = await db.Driver.create({
        userId: user._id,
        email: user.email,
        status: 'Pending Verification',
        ...driverDetails
      });
    } else if (role === 'admin') {
      profile = { name: 'Admin', role: 'admin' };
    }

    const token = auth.generateToken(user);
    res.status(201).json({ token, user: { _id: user._id, email: user.email, role: user.role }, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db.User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const match = await auth.comparePassword(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid email or password' });

    let profile = null;
    if (user.role === 'company') {
      profile = await db.Company.findOne({ userId: user._id });
    } else if (user.role === 'driver') {
      profile = await db.Driver.findOne({ userId: user._id });
    }

    const token = auth.generateToken(user);
    res.json({ token, user: { _id: user._id, email: user.email, role: user.role }, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/profile', auth.authenticateToken, async (req, res) => {
  try {
    const user = await db.User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let profile = null;
    if (user.role === 'company') {
      profile = await db.Company.findOne({ userId: user._id });
    } else if (user.role === 'driver') {
      profile = await db.Driver.findOne({ userId: user._id });
    }
    
    res.json({ user: { _id: user._id, email: user.email, role: user.role }, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Load Posting & Matching Routes
app.post('/api/loads', auth.authenticateToken, auth.requireRole(['company']), async (req, res) => {
  try {
    const company = await db.Company.findOne({ userId: req.user.userId });
    if (!company) return res.status(404).json({ error: 'Company profile not found' });

    const loadId = await db.getNextLoadId();
    const loadData = {
      _id: loadId,
      companyId: company._id,
      ...req.body,
      status: 'POSTED'
    };

    const load = await db.Load.create(loadData);

    // Dynamic Load Matching System
    const availableDrivers = await db.Driver.find({ status: 'Available' });
    const matchedDrivers = [];

    for (let driver of availableDrivers) {
      // 1. Vehicle Type Match
      const typeMatch = driver.vehicleType.toLowerCase() === load.vehicleRequirement.type.toLowerCase();
      // 2. Capacity Match
      const capacityMatch = driver.vehicleCapacity >= load.goods.weight;

      if (typeMatch && capacityMatch) {
        // Calculate Distance Score (Bengaluru - Mysuru route coordinates match)
        // Simulated: Ravi Kumar is 8KM away
        let distance = 5 + Math.floor(Math.random() * 15);
        if (driver.driverName === 'Ravi Kumar') distance = 8; // Match demo scenario

        // Calculate score out of 100
        const distanceScore = Math.max(0, 40 - distance * 1.5);
        const capacityScore = 30 + Math.min(10, (driver.vehicleCapacity - load.goods.weight) * 2);
        const ratingScore = driver.rating * 4; // Max 20
        const score = Math.round(distanceScore + capacityScore + ratingScore + 10); // +10 base/history

        matchedDrivers.push({
          driver,
          distance,
          score
        });
      }
    }

    // Sort by matching score descending
    matchedDrivers.sort((a, b) => b.score - a.score);

    // Change status to matching if suitable drivers found
    if (matchedDrivers.length > 0) {
      await db.Load.findByIdAndUpdate(loadId, { status: 'MATCHING' });
      load.status = 'MATCHING';

      // Send notifications to top matched drivers
      for (let match of matchedDrivers) {
        await createNotification(
          match.driver.userId,
          'driver',
          '🚚 NEW LOAD AVAILABLE',
          `New load from ${load.pickup.location} to ${load.delivery.location} matches your vehicle. Offered: ₹${load.payment.offeredPrice}`,
          'NEW_LOAD',
          { loadId: load._id }
        );
      }
    }

    res.status(201).json({ load, matches: matchedDrivers.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/loads', auth.authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'company') {
      const company = await db.Company.findOne({ userId: req.user.userId });
      if (company) query.companyId = company._id;
    }
    const loads = await db.Load.find(query);
    res.json(loads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/loads/available', auth.authenticateToken, auth.requireRole(['driver']), async (req, res) => {
  try {
    const driver = await db.Driver.findOne({ userId: req.user.userId });
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
    if (driver.status !== 'Available') return res.json([]);

    // Find posted/matching loads fitting the vehicle criteria
    const allLoads = await db.Load.find({});
    const availableLoads = allLoads.filter(load => {
      if (load.status !== 'POSTED' && load.status !== 'MATCHING') return false;
      
      const typeMatch = driver.vehicleType.toLowerCase() === load.vehicleRequirement.type.toLowerCase();
      const capacityMatch = driver.vehicleCapacity >= load.goods.weight;
      return typeMatch && capacityMatch;
    });

    res.json(availableLoads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/loads/:id', auth.authenticateToken, async (req, res) => {
  try {
    const load = await db.Load.findById(req.params.id);
    if (!load) return res.status(404).json({ error: 'Load not found' });

    let company = await db.Company.findById(load.companyId);
    
    // Calculate details for view
    let distance = 145; // default Bengaluru -> Mysuru
    let fuelCost = Math.round(distance * 12); // ~12 Rs per KM
    let estProfit = Math.round(load.payment.offeredPrice - fuelCost - 1500); // Tolls & other

    res.json({
      load,
      company: company ? { companyName: company.companyName, rating: company.rating } : null,
      estDistance: distance,
      estFuelCost: fuelCost,
      estProfit: estProfit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Accept Load Endpoint (CONCURRENCY LOCKING)
app.post('/api/loads/:id/accept', auth.authenticateToken, auth.requireRole(['driver']), async (req, res) => {
  const loadId = req.params.id;
  try {
    const driver = await db.Driver.findOne({ userId: req.user.userId });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (driver.status !== 'Available') return res.status(400).json({ error: 'Driver is not available' });

    // ATOMIC LOCK & ASSIGN LOAD (prevents double booking)
    const load = await db.Load.findOneAndUpdate(
      { _id: loadId, status: { $in: ['POSTED', 'MATCHING'] } },
      { status: 'DRIVER_ASSIGNED', driverId: driver._id }
    );
    
    if (!load) {
      return res.status(409).json({ error: 'This load has already been assigned to another driver.' });
    }

    // Update driver status to 'On Trip'
    await db.Driver.findByIdAndUpdate(driver._id, { status: 'On Trip' });

    // Create Trip entry
    const tripId = await db.getNextTripId();
    const trip = await db.Trip.create({
      _id: tripId,
      loadId: load._id,
      companyId: load.companyId,
      driverId: driver._id,
      status: 'DRIVER_ASSIGNED',
      simulatedRouteIndex: 0,
      locationLogs: [{ lat: driver.currentLocation.lat, lng: driver.currentLocation.lng, timestamp: new Date() }]
    });

    // Notify Company
    const companyProfile = await db.Company.findById(load.companyId);
    if (companyProfile) {
      await createNotification(
        companyProfile.userId,
        'company',
        '✅ DRIVER ACCEPTED YOUR LOAD',
        `Driver ${driver.driverName} has accepted your Load ${load._id}. Vehicle: ${driver.vehicleNumber}`,
        'LOAD_ACCEPTED',
        { tripId: trip._id, loadId: load._id }
      );
    }

    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Trip Status & State Transitions
app.get('/api/trips/:id', auth.authenticateToken, async (req, res) => {
  try {
    const trip = await db.Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const load = await db.Load.findById(trip.loadId);
    const company = await db.Company.findById(trip.companyId);
    const driver = await db.Driver.findById(trip.driverId);

    res.json({ trip, load, company, driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/trips/:id/status', auth.authenticateToken, async (req, res) => {
  const { status } = req.body;
  const tripId = req.params.id;
  try {
    const trip = await db.Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Update statuses
    await db.Trip.findByIdAndUpdate(tripId, { status });
    await db.Load.findByIdAndUpdate(trip.loadId, { status });

    // Handle specific status updates / notifications
    const companyProfile = await db.Company.findById(trip.companyId);
    const driverProfile = await db.Driver.findById(trip.driverId);

    if (status === 'GOING_TO_PICKUP') {
      await createNotification(companyProfile.userId, 'company', '🚛 DRIVER EN ROUTE', `Driver is moving towards pickup location.`, 'TRIP_UPDATE', { tripId });
    } else if (status === 'ARRIVED_AT_PICKUP') {
      await createNotification(companyProfile.userId, 'company', '📍 DRIVER ARRIVED', `Driver has arrived at your pickup location.`, 'TRIP_UPDATE', { tripId });
    } else if (status === 'LOADED') {
      await createNotification(companyProfile.userId, 'company', '📦 GOODS LOADED', `Goods have been successfully loaded onto the vehicle.`, 'TRIP_UPDATE', { tripId });
    } else if (status === 'IN_TRANSIT') {
      await createNotification(companyProfile.userId, 'company', '🚀 TRIP STARTED', `Your goods are now in transit. You can track them live on the map.`, 'TRIP_UPDATE', { tripId });
    }

    io.emit('global_trip_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload proof API (Pickup / Delivery)
app.post('/api/trips/:id/proof', auth.authenticateToken, async (req, res) => {
  const { type, photoUrl, receiptUrl, signatureUrl } = req.body;
  const tripId = req.params.id;
  try {
    const trip = await db.Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const time = new Date().toISOString();
    if (type === 'pickup') {
      await db.Trip.findByIdAndUpdate(tripId, {
        pickupProof: { photoUrl, receiptUrl, timestamp: time },
        status: 'LOADED'
      });
      await db.Load.findByIdAndUpdate(trip.loadId, { status: 'LOADED' });
      
      const company = await db.Company.findById(trip.companyId);
      await createNotification(company.userId, 'company', '📦 PICKUP CONFIRMED', 'Goods loaded. Tap to see receipt & photo.', 'TRIP_UPDATE', { tripId });
    } else if (type === 'delivery') {
      await db.Trip.findByIdAndUpdate(tripId, {
        deliveryProof: { photoUrl, receiptUrl, signatureUrl, timestamp: time },
        status: 'DELIVERED'
      });
      await db.Load.findByIdAndUpdate(trip.loadId, { status: 'DELIVERED' });

      const company = await db.Company.findById(trip.companyId);
      await createNotification(company.userId, 'company', '📦 DELIVERY COMPLETED', 'Goods delivered. Please verify and confirm payment.', 'TRIP_UPDATE', { tripId });
    }

    io.emit('global_trip_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm delivery & trigger payment
app.post('/api/trips/:id/confirm-delivery', auth.authenticateToken, auth.requireRole(['company']), async (req, res) => {
  const tripId = req.params.id;
  try {
    const trip = await db.Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const load = await db.Load.findById(trip.loadId);
    const amount = load.payment.offeredPrice;

    // Create payment entry
    const transactionId = 'TXN' + Math.floor(10000000 + Math.random() * 90000000);
    const payment = await db.Payment.create({
      tripId,
      loadId: trip.loadId,
      amount,
      status: 'Paid',
      transactionId,
      paidAt: new Date().toISOString()
    });

    // Update statuses
    await db.Trip.findByIdAndUpdate(tripId, { status: 'COMPLETED' });
    await db.Load.findByIdAndUpdate(trip.loadId, { status: 'COMPLETED' });

    // Release driver back to available
    await db.Driver.findByIdAndUpdate(trip.driverId, { 
      status: 'Available',
      $inc: { tripsCount: 1 }
    });

    await db.Company.findByIdAndUpdate(trip.companyId, {
      $inc: { tripsCount: 1 }
    });

    // Notifications
    const driver = await db.Driver.findById(trip.driverId);
    await createNotification(driver.userId, 'driver', '💰 PAYMENT RECEIVED', `Payment of ₹${amount} completed for Trip ${trip._id}.`, 'PAYMENT_RECEIVED', { tripId });
    await createNotification(req.user.userId, 'company', '💳 PAYMENT COMPLETED', `Payment of ₹${amount} processed successfully.`, 'PAYMENT_COMPLETED', { tripId });

    io.emit('global_trip_updated');
    res.json({ success: true, payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Driver Earnings API
app.get('/api/driver/earnings', auth.authenticateToken, auth.requireRole(['driver']), async (req, res) => {
  try {
    const driver = await db.Driver.findOne({ userId: req.user.userId });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const trips = await db.Trip.find({ driverId: driver._id, status: 'COMPLETED' });
    const payments = [];
    let total = 0;

    for (let trip of trips) {
      const payment = await db.Payment.findOne({ tripId: trip._id });
      if (payment) {
        payments.push({
          tripId: trip._id,
          amount: payment.amount,
          date: payment.paidAt
        });
        total += payment.amount;
      }
    }

    res.json({
      today: total > 0 ? Math.round(total * 0.2) : 0,
      thisWeek: total > 0 ? Math.round(total * 0.6) : 0,
      thisMonth: total,
      total: total,
      completedTrips: trips.length,
      history: payments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Ratings API
app.post('/api/trips/:id/rate', auth.authenticateToken, async (req, res) => {
  const tripId = req.params.id;
  const { rating, comment } = req.body;
  try {
    const trip = await db.Trip.findById(tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const role = req.user.role;
    let update = {};

    if (role === 'company') {
      update['ratings.driverRating'] = rating;
      update['ratings.driverComment'] = comment;
      await db.Trip.findByIdAndUpdate(tripId, update);

      // Re-calculate driver average rating
      const driverTrips = await db.Trip.find({ driverId: trip.driverId });
      let sum = 0, count = 0;
      for (let t of driverTrips) {
        if (t.ratings && t.ratings.driverRating) {
          sum += t.ratings.driverRating;
          count++;
        }
      }
      const avg = count > 0 ? Number((sum / count).toFixed(1)) : rating;
      await db.Driver.findByIdAndUpdate(trip.driverId, { rating: avg });

    } else if (role === 'driver') {
      update['ratings.companyRating'] = rating;
      update['ratings.companyComment'] = comment;
      await db.Trip.findByIdAndUpdate(tripId, update);

      // Re-calculate company average rating
      const companyTrips = await db.Trip.find({ companyId: trip.companyId });
      let sum = 0, count = 0;
      for (let t of companyTrips) {
        if (t.ratings && t.ratings.companyRating) {
          sum += t.ratings.companyRating;
          count++;
        }
      }
      const avg = count > 0 ? Number((sum / count).toFixed(1)) : rating;
      await db.Company.findByIdAndUpdate(trip.companyId, { rating: avg });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Chats & Notifications
app.get('/api/trips/:id/messages', auth.authenticateToken, async (req, res) => {
  try {
    const messages = await db.Message.find({ tripId: req.params.id });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', auth.authenticateToken, async (req, res) => {
  try {
    const notifications = await db.Notification.find({ userId: req.user.userId });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read-all', auth.authenticateToken, async (req, res) => {
  try {
    await db.Notification.deleteMany({ userId: req.user.userId }); // Delete for demo simplicity or set read: true
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Admin Routes
app.get('/api/admin/stats', auth.authenticateToken, auth.requireRole(['admin']), async (req, res) => {
  try {
    const companies = await db.Company.find({});
    const drivers = await db.Driver.find({});
    const loads = await db.Load.find({});
    const trips = await db.Trip.find({});
    const payments = await db.Payment.find({});

    const totalRevenue = payments.reduce((acc, curr) => acc + curr.amount, 0);
    const platformEarnings = Math.round(totalRevenue * 0.1); // 10% platform share

    res.json({
      companiesCount: companies.length,
      driversCount: drivers.length,
      verifiedDrivers: drivers.filter(d => d.status !== 'Pending Verification' && d.status !== 'Suspended').length,
      activeLoads: loads.filter(l => l.status === 'POSTED' || l.status === 'MATCHING').length,
      activeTrips: trips.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length,
      completedTrips: trips.filter(t => t.status === 'COMPLETED').length,
      totalRevenue: totalRevenue,
      platformEarnings: platformEarnings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/drivers', auth.authenticateToken, auth.requireRole(['admin']), async (resQuery, res) => {
  try {
    const drivers = await db.Driver.find({});
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/drivers/:id/verify', auth.authenticateToken, auth.requireRole(['admin']), async (req, res) => {
  try {
    const driver = await db.Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    await db.Driver.findByIdAndUpdate(req.params.id, { status: 'Available' });

    // Notify Driver
    await createNotification(driver.userId, 'driver', '🎉 PROFILE VERIFIED', 'Admin has verified your documents. You are now Available to receive loads.', 'PROFILE_VERIFIED');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/drivers/:id/toggle-block', auth.authenticateToken, auth.requireRole(['admin']), async (req, res) => {
  try {
    const driver = await db.Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const newStatus = driver.status === 'Suspended' ? 'Available' : 'Suspended';
    await db.Driver.findByIdAndUpdate(req.params.id, { status: newStatus });

    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend react index for other paths
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// Seed Initial Data function
async function seedInitialData() {
  try {
    const userCount = await db.User.find({});
    if (userCount.length === 0) {
      console.log("🌱 Seeding initial accounts...");
      
      // 1. Admin
      const adminPass = await auth.hashPassword('admin123');
      await db.User.create({
        email: 'admin@transport.com',
        password: adminPass,
        role: 'admin'
      });

      // 2. Company
      const companyPass = await auth.hashPassword('company123');
      const companyUser = await db.User.create({
        email: 'company@transport.com',
        password: companyPass,
        role: 'company'
      });
      await db.Company.create({
        userId: companyUser._id,
        companyName: 'ABC Foods Pvt Ltd',
        ownerName: 'Harsha Vardhana',
        phone: '9008007006',
        email: 'company@transport.com',
        gstNumber: '29ABCDE1234F1Z5',
        address: 'MG Road, Phase 2',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        companyType: 'Manufacturer',
        rating: 5.0,
        tripsCount: 0
      });

      // 3. Driver (Ravi Kumar - Verified/Available)
      const driverPass = await auth.hashPassword('driver123');
      const driverUser = await db.User.create({
        email: 'driver@transport.com',
        password: driverPass,
        role: 'driver'
      });
      await db.Driver.create({
        userId: driverUser._id,
        driverName: 'Ravi Kumar',
        phone: '9876543210',
        email: 'driver@transport.com',
        licenseNumber: 'KA-01-20220034567',
        licenseExpiry: new Date('2032-12-31').toISOString(),
        aadhaarNumber: '5647-8392-0192',
        vehicleNumber: 'KA01AB1234',
        vehicleType: '10 Ton Truck',
        vehicleCapacity: 10,
        vehicleRc: 'RC-9988776655',
        insurance: 'INS-2027-OK',
        puc: 'PUC-2027-EXPIRED-NO',
        currentLocation: {
          lat: 12.9716,
          lng: 77.5946,
          name: 'Bengaluru'
        },
        status: 'Available',
        rating: 4.8,
        tripsCount: 125
      });

      // 4. Pending Verification Driver
      const driverPass2 = await auth.hashPassword('driver123');
      const driverUser2 = await db.User.create({
        email: 'suresh@transport.com',
        password: driverPass2,
        role: 'driver'
      });
      await db.Driver.create({
        userId: driverUser2._id,
        driverName: 'Suresh Kumar',
        phone: '9845012345',
        email: 'suresh@transport.com',
        licenseNumber: 'KA-02-20230099881',
        licenseExpiry: new Date('2034-05-20').toISOString(),
        aadhaarNumber: '1234-5678-9012',
        vehicleNumber: 'KA02CD4567',
        vehicleType: '12 Ton Truck',
        vehicleCapacity: 12,
        vehicleRc: 'RC-1122334455',
        insurance: 'INS-2028-OK',
        puc: 'PUC-2028-OK',
        currentLocation: {
          lat: 12.9716,
          lng: 77.5946,
          name: 'Bengaluru'
        },
        status: 'Pending Verification',
        rating: 4.6,
        tripsCount: 42
      });

      console.log("✅ Seeding completed! Default accounts ready:");
      console.log("   - Admin: admin@transport.com / admin123");
      console.log("   - Company: company@transport.com / company123");
      console.log("   - Driver (Ravi Kumar): driver@transport.com / driver123");
      console.log("   - Driver (Suresh Kumar - Unverified): suresh@transport.com / driver123");
    }
  } catch (err) {
    console.error("Seeding failed", err);
  }
}

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🌐 Server running on port ${PORT}`);
  await seedInitialData();
});
