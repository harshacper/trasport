const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;
const DB_FILE = isVercel ? '/tmp/db.json' : path.join(__dirname, 'data', 'db.json');
const DB_DIR = path.dirname(DB_FILE);

let useMock = false;

// 1. JSON Local Database Fallback Implementation
const loadJsonData = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: [],
      companies: [],
      drivers: [],
      loads: [],
      trips: [],
      payments: [],
      messages: [],
      notifications: []
    }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error("Error reading JSON DB file, using empty schema", err);
    return {
      users: [], companies: [], drivers: [], loads: [], trips: [], payments: [], messages: [], notifications: []
    };
  }
};

const saveJsonData = (data) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing JSON DB file", err);
  }
};

function matchQuery(item, query) {
  for (let key in query) {
    if (key.startsWith('$')) continue; // Skip complex operators for simplicity
    
    // Support dot notation, e.g. "pickup.location" or "goods.name"
    if (key.includes('.')) {
      const parts = key.split('.');
      let val = item;
      for (let part of parts) {
        val = val ? val[part] : undefined;
      }
      if (val !== query[key]) return false;
      continue;
    }
    
    const itemVal = item[key];
    const queryVal = query[key];
    
    // Support MongoDB $in operator
    if (queryVal && typeof queryVal === 'object' && queryVal.$in) {
      if (!queryVal.$in.includes(itemVal)) return false;
      continue;
    }
    
    if (itemVal !== queryVal) {
      if (Array.isArray(itemVal) && itemVal.includes(queryVal)) {
        continue;
      }
      return false;
    }
  }
  return true;
}

class MockModel {
  constructor(collectionName) {
    this.collectionName = collectionName;
  }

  async find(query = {}) {
    const data = loadJsonData();
    let list = data[this.collectionName] || [];
    list = list.filter(item => matchQuery(item, query));
    // Sort notifications or messages by date desc/asc if needed, standard is newest first
    if (this.collectionName === 'messages' || this.collectionName === 'notifications') {
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else {
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    // Return wrapped items with .save() method
    return list.map(item => this._wrap(item));
  }

  async findOne(query = {}) {
    const list = await this.find(query);
    return list[0] || null;
  }

  async findById(id) {
    if (!id) return null;
    return this.findOne({ _id: id });
  }

  async create(doc) {
    const data = loadJsonData();
    if (!data[this.collectionName]) {
      data[this.collectionName] = [];
    }
    
    const newDoc = {
      _id: doc._id || Math.random().toString(36).substring(2, 11).toUpperCase(),
      createdAt: new Date().toISOString(),
      ...doc
    };
    
    data[this.collectionName].push(newDoc);
    saveJsonData(data);
    return this._wrap(newDoc);
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const data = loadJsonData();
    const list = data[this.collectionName] || [];
    const idx = list.findIndex(item => item._id === id);
    if (idx === -1) return null;
    
    let current = list[idx];
    let changes = update.$set || update;
    
    // Process nested update objects safely (shallow merge nested details)
    let updated = { ...current };
    for (let key in changes) {
      if (changes[key] && typeof changes[key] === 'object' && !Array.isArray(changes[key]) && !(changes[key] instanceof Date)) {
        updated[key] = { ...updated[key], ...changes[key] };
      } else {
        updated[key] = changes[key];
      }
    }
    
    list[idx] = updated;
    saveJsonData(data);
    return this._wrap(updated);
  }

  async findOneAndUpdate(query, update, options = { new: true }) {
    const data = loadJsonData();
    const list = data[this.collectionName] || [];
    const idx = list.findIndex(item => matchQuery(item, query));
    if (idx === -1) return null;
    
    let current = list[idx];
    let changes = update.$set || update;
    
    let updated = { ...current };
    for (let key in changes) {
      if (changes[key] && typeof changes[key] === 'object' && !Array.isArray(changes[key]) && !(changes[key] instanceof Date)) {
        updated[key] = { ...updated[key], ...changes[key] };
      } else {
        updated[key] = changes[key];
      }
    }
    
    list[idx] = updated;
    saveJsonData(data);
    return this._wrap(updated);
  }

  async updateOne(query, update) {
    const item = await this.findOne(query);
    if (!item) return { nModified: 0, n: 0 };
    await this.findByIdAndUpdate(item._id, update);
    return { nModified: 1, n: 1 };
  }

  async deleteMany(query = {}) {
    const data = loadJsonData();
    const list = data[this.collectionName] || [];
    const remaining = list.filter(item => !matchQuery(item, query));
    const deletedCount = list.length - remaining.length;
    data[this.collectionName] = remaining;
    saveJsonData(data);
    return { deletedCount };
  }

  _wrap(doc) {
    if (!doc) return null;
    const self = this;
    // Add Mongoose properties/methods like .save() and .toObject()
    const instance = {
      ...doc,
      toObject: function() {
        const copy = { ...this };
        delete copy.save;
        delete copy.toObject;
        return copy;
      },
      save: async function() {
        const d = loadJsonData();
        const idx = d[self.collectionName].findIndex(x => x._id === this._id);
        const savedData = this.toObject();
        if (idx !== -1) {
          d[self.collectionName][idx] = savedData;
        } else {
          d[self.collectionName].push(savedData);
        }
        saveJsonData(d);
        return this;
      }
    };
    return instance;
  }
}

// 2. Real Mongoose Database Setup
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/transport';

// Setup Schemas for Mongoose
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['company', 'driver', 'admin'], required: true },
  createdAt: { type: Date, default: Date.now }
});

const companySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  companyName: String,
  ownerName: String,
  phone: String,
  email: String,
  gstNumber: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
  companyType: String,
  rating: { type: Number, default: 5.0 },
  tripsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const driverSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  driverName: String,
  phone: String,
  email: String,
  licenseNumber: String,
  licenseExpiry: Date,
  aadhaarNumber: String,
  vehicleNumber: String,
  vehicleType: String,
  vehicleCapacity: Number,
  vehicleRc: String,
  insurance: String,
  puc: String,
  currentLocation: {
    lat: { type: Number, default: 12.9716 }, // Defaults to Bengaluru
    lng: { type: Number, default: 77.5946 },
    name: { type: String, default: 'Bengaluru' }
  },
  status: { type: String, default: 'Pending Verification' }, // Pending Verification, Verified, Available, On Trip, Offline, Suspended
  rating: { type: Number, default: 5.0 },
  tripsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const loadSchema = new mongoose.Schema({
  _id: String, // e.g. LD10001
  companyId: String,
  pickup: {
    location: String,
    address: String,
    date: String,
    time: String
  },
  delivery: {
    location: String,
    address: String,
    expectedDate: String
  },
  goods: {
    name: String,
    category: String,
    weight: Number,
    quantity: Number,
    packages: Number,
    description: String
  },
  vehicleRequirement: {
    type: { type: String },
    capacity: Number
  },
  payment: {
    offeredPrice: Number,
    priceType: String // Fixed, Negotiable
  },
  additionalInfo: {
    specialInstructions: String,
    loadingAssistance: Boolean,
    unloadingAssistance: Boolean
  },
  status: { type: String, default: 'POSTED' }, // POSTED, MATCHING, DRIVER_ASSIGNED, GOING_TO_PICKUP, ARRIVED_AT_PICKUP, LOADED, IN_TRANSIT, ARRIVED_AT_DESTINATION, DELIVERED, COMPLETED, CANCELLED
  driverId: String,
  createdAt: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
  _id: String, // e.g. TRP10001
  loadId: String,
  companyId: String,
  driverId: String,
  status: String,
  pickupProof: {
    photoUrl: String,
    receiptUrl: String,
    timestamp: Date
  },
  deliveryProof: {
    photoUrl: String,
    receiptUrl: String,
    signatureUrl: String,
    timestamp: Date
  },
  locationLogs: [{
    lat: Number,
    lng: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  simulatedRouteIndex: { type: Number, default: 0 },
  ratings: {
    driverRating: Number,
    driverComment: String,
    companyRating: Number,
    companyComment: String
  },
  createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
  tripId: String,
  loadId: String,
  amount: Number,
  status: { type: String, default: 'Pending' }, // Pending, Processing, Paid, Failed, Refunded
  transactionId: String,
  paidAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  tripId: String,
  senderId: String,
  senderRole: String,
  text: String,
  type: { type: String, default: 'text' }, // text, location, instruction
  location: {
    lat: Number,
    lng: Number
  },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  userId: String,
  role: String,
  title: String,
  body: String,
  read: { type: Boolean, default: false },
  type: String,
  data: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

// Dynamic DB Models Interface
let UserReal, CompanyReal, DriverReal, LoadReal, TripReal, PaymentReal, MessageReal, NotificationReal;
const UserMock = new MockModel('users');
const CompanyMock = new MockModel('companies');
const DriverMock = new MockModel('drivers');
const LoadMock = new MockModel('loads');
const TripMock = new MockModel('trips');
const PaymentMock = new MockModel('payments');
const MessageMock = new MockModel('messages');
const NotificationMock = new MockModel('notifications');

try {
  // Attempt standard MongoDB connection with a short timeout
  console.log("Connecting to MongoDB at:", MONGODB_URI);
  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 2000
  });

  mongoose.connection.on('connected', () => {
    console.log("🚀 Connected to MongoDB successfully!");
  });

  mongoose.connection.on('error', (err) => {
    console.warn("⚠️ MongoDB connection error. Falling back to local JSON database mode.");
    useMock = true;
  });

  // Compile Mongoose models
  UserReal = mongoose.model('User', userSchema);
  CompanyReal = mongoose.model('Company', companySchema);
  DriverReal = mongoose.model('Driver', driverSchema);
  LoadReal = mongoose.model('Load', loadSchema);
  TripReal = mongoose.model('Trip', tripSchema);
  PaymentReal = mongoose.model('Payment', paymentSchema);
  MessageReal = mongoose.model('Message', messageSchema);
  NotificationReal = mongoose.model('Notification', notificationSchema);

} catch (e) {
  console.warn("⚠️ Mongoose setup failed. Falling back to local JSON database mode.");
  useMock = true;
}

// Export Db interface
module.exports = {
  getIsMock: () => useMock,
  get User() { return useMock ? UserMock : UserReal; },
  get Company() { return useMock ? CompanyMock : CompanyReal; },
  get Driver() { return useMock ? DriverMock : DriverReal; },
  get Load() { return useMock ? LoadMock : LoadReal; },
  get Trip() { return useMock ? TripMock : TripReal; },
  get Payment() { return useMock ? PaymentMock : PaymentReal; },
  get Message() { return useMock ? MessageMock : MessageReal; },
  get Notification() { return useMock ? NotificationMock : NotificationReal; },
  
  // Custom helpers
  getNextLoadId: async () => {
    const list = await (useMock ? LoadMock.find({}) : LoadReal.find({}));
    return `LD${10000 + list.length + 1}`;
  },
  getNextTripId: async () => {
    const list = await (useMock ? TripMock.find({}) : TripReal.find({}));
    return `TRP${10000 + list.length + 1}`;
  }
};
