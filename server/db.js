const supabase = require('./supabase');

// Helper to convert snake_case column names back to camelCase for JavaScript compatibility
const mapRow = (row) => {
  if (!row) return null;
  if (Array.isArray(row)) return row.map(mapRow);
  
  const clone = { ...row };
  if (clone.id !== undefined) {
    clone._id = clone.id.toString(); // Maintain _id format for frontend compatibility
  }
  
  const camelObj = {};
  for (const key in clone) {
    const camelKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
    camelObj[camelKey] = clone[key];
  }
  
  // Backwards compatibility fallback for snake_case properties
  for (const key in clone) {
    if (camelObj[key] === undefined) {
      camelObj[key] = clone[key];
    }
  }
  return camelObj;
};

// Helper to convert JavaScript camelCase properties to database snake_case columns
const mapDoc = (doc) => {
  if (!doc) return null;
  const result = {};
  for (const key in doc) {
    // Skip helper methods or id properties that are automatically handled by PG serial primary keys
    if (key === '_id' || key === 'id' || typeof doc[key] === 'function') continue;
    
    // Skip conversion for JSONB nested columns which should retain their JS structure
    if (key === 'goods' || key === 'vehicle' || key === 'location') {
      result[key] = doc[key];
      continue;
    }
    
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    
    // Explicit mappings for foreign keys
    if (key === 'userId') result.user_id = doc.userId;
    else if (key === 'companyId') result.company_id = doc.companyId;
    else if (key === 'driverId') result.driver_id = doc.driverId;
    else if (key === 'loadId') result.load_id = doc.loadId;
    else if (key === 'tripId') result.trip_id = doc.tripId;
    else if (key === 'fromUserId') result.from_user_id = doc.fromUserId;
    else if (key === 'toUserId') result.to_user_id = doc.toUserId;
    else {
      result[snakeKey] = doc[key];
    }
  }
  return result;
};

// Helper to translate JavaScript query parameters to Supabase query building filters
const mapQuery = (query, builder) => {
  if (!query) return builder;
  for (const key in query) {
    let dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    
    // Exclude foreign keys explicitly
    if (key === '_id' || key === 'id') dbKey = 'id';
    else if (key === 'userId') dbKey = 'user_id';
    else if (key === 'companyId') dbKey = 'company_id';
    else if (key === 'driverId') dbKey = 'driver_id';
    else if (key === 'loadId') dbKey = 'load_id';
    else if (key === 'tripId') dbKey = 'trip_id';
    
    const val = query[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (val.$in) {
        builder = builder.in(dbKey, val.$in);
      } else if (val.$ne) {
        builder = builder.neq(dbKey, val.$ne);
      }
    } else {
      builder = builder.eq(dbKey, val);
    }
  }
  return builder;
};

// Thenable Chain to mimic Mongoose Query builders (.sort, .limit, await)
class QueryChain {
  constructor(table, query) {
    this.table = table;
    this.query = query;
    this.sortParams = null;
    this.limitCount = null;
  }
  
  sort(sortObj) {
    this.sortParams = sortObj;
    return this;
  }
  
  limit(n) {
    this.limitCount = n;
    return this;
  }
  
  async then(resolve, reject) {
    try {
      let builder = supabase.from(this.table).select('*');
      builder = mapQuery(this.query, builder);
      
      if (this.sortParams) {
        for (const key in this.sortParams) {
          const dbKey = key === 'createdAt' ? 'created_at' : (key === 'timestamp' ? 'timestamp' : key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`));
          builder = builder.order(dbKey, { ascending: this.sortParams[key] === 1 });
        }
      }
      
      if (this.limitCount !== null) {
        builder = builder.limit(this.limitCount);
      }
      
      const { data, error } = await builder;
      if (error) throw error;
      resolve(mapRow(data));
    } catch (err) {
      if (reject) reject(err);
      else throw err;
    }
  }
}

// Generate models mimicking standard Mongoose operations
const createModel = (table) => {
  return {
    find: (query = {}) => {
      return new QueryChain(table, query);
    },
    
    findOne: async (query = {}) => {
      let builder = supabase.from(table).select('*');
      builder = mapQuery(query, builder);
      const { data, error } = await builder.maybeSingle();
      if (error) throw error;
      return mapRow(data);
    },
    
    findById: async (id) => {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return mapRow(data);
    },
    
    create: async (doc) => {
      const mapped = mapDoc(doc);
      const { data, error } = await supabase.from(table).insert([mapped]).select();
      if (error) throw error;
      return mapRow(data[0]);
    },
    
    findByIdAndUpdate: async (id, update) => {
      const mapped = mapDoc(update);
      const { data, error } = await supabase.from(table).update(mapped).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) return null;
      return mapRow(data[0]);
    },
    
    findOneAndUpdate: async (query, update) => {
      const mapped = mapDoc(update);
      let builder = supabase.from(table).update(mapped).select('*');
      builder = mapQuery(query, builder);
      const { data, error } = await builder;
      if (error) throw error;
      if (!data || data.length === 0) return null;
      return mapRow(data[0]);
    },
    
    updateMany: async (query, update) => {
      const mapped = mapDoc(update);
      let builder = supabase.from(table).update(mapped);
      builder = mapQuery(query, builder);
      const { error } = await builder;
      if (error) throw error;
      return { acknowledged: true };
    },
    
    deleteOne: async (query) => {
      let builder = supabase.from(table).delete();
      builder = mapQuery(query, builder);
      const { error } = await builder;
      if (error) throw error;
      return { deletedCount: 1 };
    }
  };
};

const getNextLoadId = async () => {
  const { data, error } = await supabase
    .from('loads')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) return '1';
  if (!data || data.length === 0) return '1';
  return (Number(data[0].id) + 1).toString();
};

const getNextTripId = async () => {
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) return '1';
  if (!data || data.length === 0) return '1';
  return (Number(data[0].id) + 1).toString();
};

module.exports = {
  getNextLoadId,
  getNextTripId,
  User: createModel('users'),
  Company: createModel('companies'),
  Driver: createModel('drivers'),
  Load: createModel('loads'),
  Trip: createModel('trips'),
  LocationLog: createModel('location_logs'),
  Rating: createModel('ratings'),
  Notification: createModel('notifications'),
  Chat: createModel('chats')
};
