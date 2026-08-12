import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Truck, ShieldCheck, DollarSign, MapPin, Navigation, MessageSquare, 
  Bell, FileText, Star, User, Building, Settings, CheckCircle, 
  ArrowRight, Upload, Phone, LogOut, Info, AlertTriangle, Play, Check,
  Briefcase, CheckSquare, Plus, Send, X, StarHalf
} from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/' : '/';

export default function App() {
  // Global States
  const [role, setRole] = useState('guest'); // guest, company, driver, admin
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  
  // App views
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loads, setLoads] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  
  // Dialogs / Form States
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeChatTripId, setActiveChatTripId] = useState(null);
  const [showPostLoadModal, setShowPostLoadModal] = useState(false);
  const [matchedDrivers, setMatchedDrivers] = useState([]);
  const [selectedLoadForMatching, setSelectedLoadForMatching] = useState(null);
  const [selectedLoadDetails, setSelectedLoadDetails] = useState(null);
  
  // Rating states
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTripId, setRatingTripId] = useState(null);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  
  // Authentication Form States
  const [authMode, setAuthMode] = useState('login'); // login, register
  const [authRole, setAuthRole] = useState('company'); // company, driver
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Company specific reg fields
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [companyType, setCompanyType] = useState('Manufacturer');
  
  // Driver specific reg fields
  const [driverName, setDriverName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('10 Ton Truck');
  const [vehicleCapacity, setVehicleCapacity] = useState('10');
  
  // Post Load Form States
  const [pickupLoc, setPickupLoc] = useState('Bengaluru');
  const [pickupAddr, setPickupAddr] = useState('HSR Layout, Sector 3');
  const [pickupDate, setPickupDate] = useState('Today');
  const [pickupTime, setPickupTime] = useState('10:00 AM');
  const [deliveryLoc, setDeliveryLoc] = useState('Mysuru');
  const [deliveryAddr, setDeliveryAddr] = useState('Hebbal Industrial Area');
  const [deliveryDate, setDeliveryDate] = useState('Tomorrow');
  const [goodsName, setGoodsName] = useState('Rice');
  const [goodsCategory, setGoodsCategory] = useState('Agricultural');
  const [goodsWeight, setGoodsWeight] = useState('8');
  const [goodsQuantity, setGoodsQuantity] = useState('80');
  const [goodsPackages, setGoodsPackages] = useState('80 Bags');
  const [goodsDesc, setGoodsDesc] = useState('Basmati Rice cargo, stacked on pallets.');
  const [reqVehicleType, setReqVehicleType] = useState('10 Ton Truck');
  const [reqCapacity, setReqCapacity] = useState('10');
  const [offeredPrice, setOfferedPrice] = useState('18000');
  const [priceType, setPriceType] = useState('Fixed');
  const [specialInstructions, setSpecialInstructions] = useState('Keep away from moisture. Tarpaulin cover required.');
  const [loadingAssistance, setLoadingAssistance] = useState(true);
  const [unloadingAssistance, setUnloadingAssistance] = useState(true);

  // Chat message text
  const [newMessageText, setNewMessageText] = useState('');
  
  // Admin drivers list
  const [adminDrivers, setAdminDrivers] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  
  // Driver Earnings statistics
  const [driverEarnings, setDriverEarnings] = useState(null);

  // Supabase Integration States
  const [todos, setTodos] = useState([]);
  const [newTodoName, setNewTodoName] = useState('');
  const [loadingTodos, setLoadingTodos] = useState(false);
  
  // Socket ref
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  // Setup sockets and notifications
  useEffect(() => {
    if (token) {
      fetchProfile();
    }
  }, [token]);

  useEffect(() => {
    if (currentUser) {
      // Connect websocket
      const socket = io(SOCKET_URL);
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log("WebSocket connected!");
        socket.emit('register_user', currentUser._id);
      });

      socket.on('notification_received', (notif) => {
        setNotifications(prev => [notif, ...prev]);
        // Trigger notification sound or state updates
        fetchNotifications();
        triggerReloadData();
      });

      socket.on('new_chat_message', (msg) => {
        if (activeChatTripId === msg.tripId) {
          setChatMessages(prev => [...prev, msg]);
        }
        // Force refresh notifications/trips
        triggerReloadData();
      });

      socket.on('tracking_update', (update) => {
        console.log("GPS Track progress update:", update);
        // If active trip is matching
        if (activeTrip && activeTrip._id === update.tripId) {
          setActiveTrip(prev => ({
            ...prev,
            simulatedRouteIndex: update.index,
            locationLogs: [...(prev.locationLogs || []), { lat: update.currentLocation.lat, lng: update.currentLocation.lng, timestamp: new Date() }]
          }));
        }
        triggerReloadData();
      });

      socket.on('global_trip_updated', () => {
        triggerReloadData();
      });

      fetchNotifications();
      triggerReloadData();

      return () => {
        socket.disconnect();
      };
    }
  }, [currentUser, activeChatTripId, activeTrip?._id]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const triggerReloadData = () => {
    fetchLoads();
    fetchTrips();
    if (currentUser?.role === 'driver') {
      fetchDriverEarnings();
    }
    if (currentUser?.role === 'admin') {
      fetchAdminData();
    }
  };

  const fetchTodos = async () => {
    setLoadingTodos(true);
    try {
      const res = await fetch(`${SOCKET_URL}api/todos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(data || []);
      }
    } catch (e) {
      console.error("Error fetching todos:", e);
    } finally {
      setLoadingTodos(false);
    }
  };

  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!newTodoName.trim()) return;
    try {
      const res = await fetch(`${SOCKET_URL}api/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newTodoName })
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(prev => [...prev, data]);
        setNewTodoName('');
      } else {
        alert(data.error || 'Failed to add todo');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTodo = async (todo) => {
    const nextCompleted = !todo.completed;
    try {
      const res = await fetch(`${SOCKET_URL}api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ completed: nextCompleted })
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(prev => prev.map(t => t.id === todo.id ? data : t));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTodo = async (todoId) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/todos/${todoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTodos(prev => prev.filter(t => t.id !== todoId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token && activeTab === 'todos') {
      fetchTodos();
    }
  }, [token, activeTab]);

  // REST API Actions
  const fetchProfile = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}api/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
        setRole(data.user.role);
        setProfile(data.profile);
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLoads = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}api/loads`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLoads(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTrips = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}api/loads`, { // Fetch associated loads/trips
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Standard load trips are resolved
      const tripsRes = await fetch(`${SOCKET_URL}api/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // We can fetch active trips via a helper or query
      const activeTripsRes = await fetch(`${SOCKET_URL}api/loads`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Simply call driver trips if driver, company trips if company
      // Or fetch from server
      let endpoint = currentUser?.role === 'company' ? 'company/bookings' : 'driver/trips';
      // In our server, we fetch trips by fetching load assignments.
      // Let's implement active trip loading from lists
      // To simplify, we query the server loads and extract.
    } catch (e) {}
  };

  // We can fetch trips directly by fetching load states on backend
  const fetchAllTrips = async () => {
    // For simplicity, we filter/fetch active bookings based on loads & trips
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setNotifications(data);
      }
    } catch (e) {}
  };

  const clearNotifications = async () => {
    try {
      await fetch(`${SOCKET_URL}api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications([]);
    } catch (e) {}
  };

  const fetchDriverEarnings = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}api/driver/earnings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setDriverEarnings(data);
      }
    } catch (e) {}
  };

  const fetchAdminData = async () => {
    try {
      const statsRes = await fetch(`${SOCKET_URL}api/admin/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statsData = await statsRes.json();
      if (statsRes.ok) setAdminStats(statsData);

      const driversRes = await fetch(`${SOCKET_URL}api/admin/drivers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const driversData = await driversRes.json();
      if (driversRes.ok) setAdminDrivers(driversData);
    } catch (e) {}
  };

  const handleVerifyDriver = async (driverId) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/admin/drivers/${driverId}/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (e) {}
  };

  const handleToggleBlockDriver = async (driverId) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/admin/drivers/${driverId}/toggle-block`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (e) {}
  };

  // Auth Handling
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const endpoint = authMode === 'login' ? 'login' : 'register';
    const body = {
      email,
      password,
      role: authRole,
      companyDetails: authRole === 'company' ? {
        companyName, ownerName, phone, gstNumber, address: companyAddress, city, state, pincode, companyType
      } : null,
      driverDetails: authRole === 'driver' ? {
        driverName, phone, licenseNumber, licenseExpiry, aadhaarNumber, vehicleNumber, vehicleType, vehicleCapacity: Number(vehicleCapacity)
      } : null
    };

    try {
      const res = await fetch(`${SOCKET_URL}api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setRole(data.user.role);
        setProfile(data.profile);
        setActiveTab('dashboard');
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  // Quick Demo Auto-Login
  const handleDemoLogin = async (demoEmail, demoPassword) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: demoPassword })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setRole(data.user.role);
        setProfile(data.profile);
        setActiveTab('dashboard');
        setActiveTrip(null);
        setActiveChatTripId(null);
        setShowNotifications(false);
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Demo login connection failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setCurrentUser(null);
    setRole('guest');
    setProfile(null);
    setActiveTab('dashboard');
  };

  // Create Load Action
  const handlePostLoad = async (e) => {
    e.preventDefault();
    const body = {
      pickup: { location: pickupLoc, address: pickupAddr, date: pickupDate, time: pickupTime },
      delivery: { location: deliveryLoc, address: deliveryAddr, expectedDate: deliveryDate },
      goods: { name: goodsName, category: goodsCategory, weight: Number(goodsWeight), quantity: Number(goodsQuantity), packages: goodsPackages, description: goodsDesc },
      vehicleRequirement: { type: reqVehicleType, capacity: Number(reqCapacity) },
      payment: { offeredPrice: Number(offeredPrice), priceType },
      additionalInfo: { specialInstructions, loadingAssistance, unloadingAssistance }
    };

    try {
      const res = await fetch(`${SOCKET_URL}api/loads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        setShowPostLoadModal(false);
        fetchLoads();
        alert(`Load Posted Successfully! ID: ${data.load._id}`);
        // If matches available, open matching viewer
        if (data.matches && data.matches.length > 0) {
          setMatchedDrivers(data.matches);
          setSelectedLoadForMatching(data.load);
          setActiveTab('find-driver');
        }
      } else {
        alert(data.error || 'Failed to post load');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Accept Load (Driver)
  const handleAcceptLoad = async (loadId) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/loads/${loadId}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert("Load Accepted Successfully!");
        // Fetch trip details and open trip tracker
        handleViewTrip(data.trip._id);
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Error accepting load");
    }
  };

  // Reject Load Offer (Driver simulation - locally hides load)
  const handleRejectLoad = (loadId) => {
    alert("Load rejected and removed from available list.");
    fetchLoads();
  };

  // View Trip Details & GPS Tracker
  const handleViewTrip = async (tripId) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/trips/${tripId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActiveTrip(data.trip);
        // We'll also save matched details
        setSelectedLoadDetails(data);
        setActiveTab('tracking');
      }
    } catch (e) {}
  };

  // Update Trip Lifecycle Status (Driver)
  const handleUpdateTripStatus = async (tripId, status) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/trips/${tripId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        handleViewTrip(tripId);
      }
    } catch (e) {}
  };

  // Upload Pickup/Delivery Proof Simulator
  const handleUploadProof = async (tripId, type) => {
    const body = { type };
    if (type === 'pickup') {
      body.photoUrl = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80';
      body.receiptUrl = 'RECEIPT_CARGO_1002.pdf';
    } else {
      body.photoUrl = 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&q=80';
      body.receiptUrl = 'DELIVERY_CHALLAN_99.pdf';
      body.signatureUrl = 'Ravi Kumar (Digital)';
    }

    try {
      const res = await fetch(`${SOCKET_URL}api/trips/${tripId}/proof`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        alert(`${type === 'pickup' ? 'Pickup' : 'Delivery'} proof uploaded!`);
        handleViewTrip(tripId);
      }
    } catch (e) {}
  };

  // Confirm Delivery and pay driver (Company)
  const handleConfirmDelivery = async (tripId) => {
    try {
      const res = await fetch(`${SOCKET_URL}api/trips/${tripId}/confirm-delivery`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Delivery Confirmed & Simulated Payment Transferred to Driver!");
        setRatingTripId(tripId);
        setShowRatingModal(true);
        handleViewTrip(tripId);
      }
    } catch (e) {}
  };

  // Submit Star Review
  const handleSubmitReview = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}api/trips/${ratingTripId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rating: ratingStars, comment: ratingComment })
      });
      if (res.ok) {
        alert("Thank you for your rating!");
        setShowRatingModal(false);
        setRatingComment('');
        setRatingStars(5);
        setActiveTab('dashboard');
        triggerReloadData();
      }
    } catch (e) {}
  };

  // Messaging / Chat handler
  const openChat = async (tripId) => {
    setActiveChatTripId(tripId);
    setActiveTab('messages');
    try {
      const res = await fetch(`${SOCKET_URL}api/trips/${tripId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setChatMessages(data);
      }
    } catch (e) {}
  };

  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || !socketRef.current) return;

    const messageData = {
      tripId: activeChatTripId,
      senderId: currentUser._id,
      senderRole: role,
      text: newMessageText,
      type: 'text'
    };

    socketRef.current.emit('send_chat_message', messageData);
    setNewMessageText('');
  };

  const handleSendInstructions = (text) => {
    if (!socketRef.current) return;
    const messageData = {
      tripId: activeChatTripId,
      senderId: currentUser._id,
      senderRole: role,
      text: text,
      type: 'instruction'
    };
    socketRef.current.emit('send_chat_message', messageData);
  };

  const handleSendLocation = () => {
    if (!socketRef.current) return;
    const messageData = {
      tripId: activeChatTripId,
      senderId: currentUser._id,
      senderRole: role,
      text: "Shared Location",
      type: 'location',
      location: { lat: 12.9716, lng: 77.5946 }
    };
    socketRef.current.emit('send_chat_message', messageData);
  };

  // Quick route tracking coordinates logic
  const ROUTE_POINTS = [
    { lat: 12.9716, lng: 77.5946, name: "Bengaluru" },
    { lat: 12.8756, lng: 77.4012, name: "Kengeri" },
    { lat: 12.7234, lng: 77.2798, name: "Bidadi" },
    { lat: 12.5221, lng: 77.1755, name: "Ramanagara" },
    { lat: 12.4332, lng: 77.0421, name: "Channapatna" },
    { lat: 12.5218, lng: 76.8974, name: "Maddur" },
    { lat: 12.5222, lng: 76.7198, name: "Mandya" },
    { lat: 12.4215, lng: 76.6982, name: "Srirangapatna" },
    { lat: 12.2958, lng: 76.6394, name: "Mysuru" }
  ];

  // Helper getters
  const activeTripsCount = loads.filter(l => l.status !== 'COMPLETED' && l.status !== 'CANCELLED' && l.status !== 'POSTED' && l.status !== 'MATCHING').length;
  const pendingLoadsCount = loads.filter(l => l.status === 'POSTED' || l.status === 'MATCHING').length;
  const deliveredTripsCount = loads.filter(l => l.status === 'DELIVERED').length;
  const totalSpent = loads.filter(l => l.status === 'COMPLETED').reduce((sum, curr) => sum + (curr.payment?.offeredPrice || 0), 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 2. CORE NAVBAR */}
      <header className="glass-panel" style={{
        margin: '1rem',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, #3B82F6 100%)',
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
          }}>
            <Truck size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', letterSpacing: '0.05em', color: '#fff' }}>LOGIX</h2>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Logistics Portal</span>
          </div>
        </div>

        {role !== 'guest' && (
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button 
              className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              onClick={() => { setActiveTab('dashboard'); setActiveTrip(null); }}
            >
              Dashboard
            </button>

            {role === 'company' && (
              <button 
                className="btn btn-primary" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'linear-gradient(135deg, #10B981, #059669)' }}
                onClick={() => setShowPostLoadModal(true)}
              >
                <Plus size={16} /> Post Load
              </button>
            )}

            {role === 'driver' && (
              <button 
                className={`btn ${activeTab === 'earnings' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                onClick={() => setActiveTab('earnings')}
              >
                My Earnings
              </button>
            )}

            <button 
              className={`btn ${activeTab === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('todos')}
            >
              Supabase Todos
            </button>

            {/* Notifications Bell */}
            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.5rem', borderRadius: '50%' }}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={18} />
                {notifications.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    backgroundColor: 'var(--danger)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 'bold'
                  }}>{notifications.length}</span>
                )}
              </button>

              {/* Notification Tray */}
              {showNotifications && (
                <div className="glass-panel" style={{
                  position: 'absolute',
                  right: 0,
                  top: '45px',
                  width: '320px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  padding: '1rem',
                  zIndex: 100,
                  border: '1px solid var(--border-glass-active)',
                  boxShadow: 'var(--shadow-lg)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem' }}>Recent Notifications</h4>
                    <button onClick={clearNotifications} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem' }}>Clear all</button>
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>No new notifications</p>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif._id} className="glass-card" style={{ marginBottom: '0.5rem', padding: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                          <Truck size={14} style={{ color: 'var(--primary)', marginTop: '2px' }} />
                          <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>{notif.title}</p>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{notif.body}</p>
                            {notif.data?.tripId && (
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '2px 8px', fontSize: '0.65rem', marginTop: '0.25rem' }}
                                onClick={() => { handleViewTrip(notif.data.tripId); setShowNotifications(false); }}
                              >
                                View Trip
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Logout */}
            <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={handleLogout} title="Log Out">
              <LogOut size={16} />
            </button>
          </nav>
        )}
      </header>

      {/* 3. MAIN DASHBOARD CONTENT AREA */}
      <main style={{ flex: 1, padding: '0 1rem 1rem' }}>
        
        {/* =============================================
            A. GUEST PORTAL (LOGIN & REGISTRATION)
            ============================================= */}
        {role === 'guest' && (
          <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2rem' }} className="glass-panel">
            <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontFamily: 'var(--font-title)', fontSize: '2rem' }}>
              {authMode === 'login' ? '🔑 Dashboard Login' : '🚚 Register Profile'}
            </h2>
            
            <form onSubmit={handleAuthSubmit}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button 
                  type="button" 
                  className={`btn ${authRole === 'company' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setAuthRole('company')}
                >
                  🏢 Company/Shipper
                </button>
                <button 
                  type="button" 
                  className={`btn ${authRole === 'driver' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setAuthRole('driver')}
                >
                  🚛 Truck Driver
                </button>
              </div>

              {/* Registration Specific Fields */}
              {authMode === 'register' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                  {authRole === 'company' ? (
                    <>
                      <div className="form-group-grid">
                        <div>
                          <label>Company Name</label>
                          <input required type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. ABC Foods Ltd" />
                        </div>
                        <div>
                          <label>Owner/Manager Name</label>
                          <input required type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Full Name" />
                        </div>
                      </div>
                      <div className="form-group-grid">
                        <div>
                          <label>GST Number</label>
                          <input required type="text" value={gstNumber} onChange={e => setGstNumber(e.target.value)} placeholder="29ABCDE1234F1Z5" />
                        </div>
                        <div>
                          <label>Company Type</label>
                          <select value={companyType} onChange={e => setCompanyType(e.target.value)}>
                            <option>Manufacturer</option>
                            <option>Distributor</option>
                            <option>Retailer</option>
                            <option>Logistics Agent</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label>Company Address</label>
                        <input required type="text" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="Flat, Street name" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label>City</label>
                          <input required type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
                        </div>
                        <div>
                          <label>State</label>
                          <input required type="text" value={state} onChange={e => setState(e.target.value)} placeholder="State" />
                        </div>
                        <div>
                          <label>Pincode</label>
                          <input required type="text" value={pincode} onChange={e => setPincode(e.target.value)} placeholder="Pincode" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group-grid">
                        <div>
                          <label>Driver Name</label>
                          <input required type="text" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Ravi Kumar" />
                        </div>
                        <div>
                          <label>Driving License Number</label>
                          <input required type="text" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="KA-01-YYYYXXXX" />
                        </div>
                      </div>
                      <div className="form-group-grid">
                        <div>
                          <label>License Expiry</label>
                          <input required type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} />
                        </div>
                        <div>
                          <label>Aadhaar / Identity No</label>
                          <input required type="text" value={aadhaarNumber} onChange={e => setAadhaarNumber(e.target.value)} placeholder="12-digit number" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label>Vehicle Number</label>
                          <input required type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="KA01AB1234" />
                        </div>
                        <div>
                          <label>Vehicle Type</label>
                          <select value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
                            <option>10 Ton Truck</option>
                            <option>12 Ton Truck</option>
                            <option>Mini Truck</option>
                            <option>Pickup</option>
                            <option>Lorry</option>
                            <option>Container</option>
                            <option>Trailer</option>
                          </select>
                        </div>
                        <div>
                          <label>Capacity (Tons)</label>
                          <input required type="number" value={vehicleCapacity} onChange={e => setVehicleCapacity(e.target.value)} placeholder="e.g. 10" />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="form-group-grid">
                    <div>
                      <label>Contact Phone</label>
                      <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" />
                    </div>
                  </div>
                </div>
              )}

              {/* Login Fields */}
              <div style={{ marginBottom: '1rem' }}>
                <label>Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@address.com" />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label>Password</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }}>
                {authMode === 'login' ? 'Log In' : 'Create Account'}
              </button>

              <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                {authMode === 'login' ? (
                  <p>Don't have an account? <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setAuthMode('register')}>Register Here</span></p>
                ) : (
                  <p>Already have an account? <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setAuthMode('login')}>Log In</span></p>
                )}
              </div>
            </form>
          </div>
        )}

        {/* =============================================
            B. COMPANY DASHBOARD
            ============================================= */}
        {role === 'company' && activeTab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem' }}>🏢 Company Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Welcome back, {profile?.ownerName || 'Shipper'} | GST: {profile?.gstNumber}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-company)' }}>Average Rating: ⭐ {profile?.rating || '5.0'}</span>
              </div>
            </div>

            {/* Statistics Row */}
            <div className="dashboard-grid">
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-company)' }}>
                  <Briefcase size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{activeTripsCount}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active Bookings</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#A78BFA' }}>
                  <Plus size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{pendingLoadsCount}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pending Loads</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(236, 72, 153, 0.15)', color: '#F472B6' }}>
                  <CheckSquare size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{deliveredTripsCount}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Delivered Loads</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA' }}>
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>₹{totalSpent.toLocaleString()}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Spent</p>
                </div>
              </div>
            </div>

            {/* Active Bookings & History Table */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Truck size={20} color="var(--primary)" /> Manage Booking History & Active Trips
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Load ID</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Route</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Goods details</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Driver Assigned</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Price</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                          No loads posted yet. Click "Post Load" to start.
                        </td>
                      </tr>
                    ) : (
                      loads.map(load => (
                        <tr key={load._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '1rem 0.5rem', fontSize: '0.85rem', fontWeight: 'bold' }}>{load._id}</td>
                          <td style={{ padding: '1rem 0.5rem', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span>{load.pickup.location}</span>
                              <ArrowRight size={12} style={{ color: 'var(--text-secondary)' }} />
                              <span>{load.delivery.location}</span>
                            </div>
                          </td>
                          <td style={{ padding: '1rem 0.5rem', fontSize: '0.85rem' }}>{load.goods.name} ({load.goods.weight} Tons)</td>
                          <td style={{ padding: '1rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {load.driverId ? (
                              <span style={{ color: '#fff', fontWeight: '500' }}>Ravi Kumar (KA01AB1234)</span>
                            ) : (
                              <span>Matching...</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem 0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>₹{load.payment.offeredPrice.toLocaleString()}</td>
                          <td style={{ padding: '1rem 0.5rem' }}>
                            <span className={`badge badge-${load.status.toLowerCase().replace(/_/g, '')}`}>
                              {load.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '1rem 0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {load.status !== 'POSTED' && load.status !== 'MATCHING' && (
                                <>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                    onClick={() => handleViewTrip(load._id.replace('LD', 'TRP'))}
                                  >
                                    Track
                                  </button>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                                    onClick={() => openChat(load._id.replace('LD', 'TRP'))}
                                  >
                                    Chat
                                  </button>
                                </>
                              )}
                              {(load.status === 'POSTED' || load.status === 'MATCHING') && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Finding Drivers</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =============================================
            C. DRIVER DASHBOARD
            ============================================= */}
        {role === 'driver' && activeTab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem' }}>🚛 Driver App Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Driver: {profile?.driverName} | Vehicle: {profile?.vehicleNumber} ({profile?.vehicleType})
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-driver)' }}>Rating: ⭐ {profile?.rating || '5.0'}</span>
                
                {/* Active Availability Toggle Switch */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px' }} className="glass-card">
                  <span className={`pulsing-dot ${profile?.status === 'Available' ? 'available' : profile?.status === 'On Trip' ? 'ontrip' : 'offline'}`}></span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{profile?.status.toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Verification Alert Banner */}
            {profile?.status === 'Pending Verification' && (
              <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid var(--warning)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle color="var(--warning)" size={24} />
                <div>
                  <h4 style={{ color: '#fff', fontSize: '0.9rem' }}>Verification Pending</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Your driver documents are being audited by the Admin. You will receive a notification once verified to begin accepting loads.</p>
                </div>
              </div>
            )}

            {/* Driver Earnings Summary Grid */}
            <div className="dashboard-grid">
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-company)' }}>
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>₹{driverEarnings?.today?.toLocaleString() || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Today's Earnings</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-driver)' }}>
                  <Briefcase size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{driverEarnings?.completedTrips || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Completed Trips</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA' }}>
                  <CheckSquare size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>₹{driverEarnings?.thisMonth?.toLocaleString() || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>This Month's Earnings</p>
                </div>
              </div>
            </div>

            {/* Available Load Matches Container */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bell size={20} color="var(--color-driver)" /> Nearby Load Alerts & Match Offers
                </h3>

                {profile?.status === 'Pending Verification' ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>Verify your driver profile to access the load offers board.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* We filter active loads where status is MATCHING or POSTED and fits the driver's vehicle criteria */}
                    {loads.filter(l => l.status === 'POSTED' || l.status === 'MATCHING').length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No active load offers match your vehicle profile right now.</p>
                    ) : (
                      loads.filter(l => l.status === 'POSTED' || l.status === 'MATCHING').map(load => (
                        <div key={load._id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', mdDirection: 'row', justifyContent: 'space-between', padding: '1.25rem', gap: '1rem', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span className="badge badge-posted">{load._id}</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Category: {load.goods.category}</span>
                            </div>
                            <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <MapPin size={16} color="var(--danger)" /> {load.pickup.location} 
                              <ArrowRight size={14} /> 
                              <MapPin size={16} color="var(--success)" /> {load.delivery.location}
                            </h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Goods: <strong>{load.goods.name}</strong> ({load.goods.weight} Tons) | Body Required: <strong>{load.vehicleRequirement.type}</strong>
                            </p>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
                            <div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Offered Price</span>
                              <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-driver)' }}>₹{load.payment.offeredPrice.toLocaleString()}</span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                onClick={() => {
                                  // Open details view
                                  setSelectedLoadDetails({ load });
                                  setActiveTab('tracking'); // Redirect to details (same page component)
                                }}
                              >
                                View Load
                              </button>
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', backgroundColor: 'var(--color-driver)' }}
                                onClick={() => handleAcceptLoad(load._id)}
                              >
                                Accept Load
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Active Trip Box */}
              {loads.some(l => l.driverId === profile?._id && l.status !== 'COMPLETED' && l.status !== 'CANCELLED') && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Navigation size={20} color="var(--primary)" /> Your Active Assigned Trip
                  </h3>
                  {loads.filter(l => l.driverId === profile?._id && l.status !== 'COMPLETED' && l.status !== 'CANCELLED').map(load => (
                    <div key={load._id} className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4>Trip Code: {load._id.replace('LD', 'TRP')}</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Route: {load.pickup.location} → {load.delivery.location} | status: {load.status}</p>
                      </div>
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                        onClick={() => handleViewTrip(load._id.replace('LD', 'TRP'))}
                      >
                        Manage Active Trip
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================
            D. FIND DRIVERS & MATCHING MULTI-PANEL (COMPANY)
            ============================================= */}
        {role === 'company' && activeTab === 'find-driver' && selectedLoadForMatching && (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
              <div>
                <h2>Recommend Drivers for Load: {selectedLoadForMatching._id}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Pickup: {selectedLoadForMatching.pickup.location} | Goods: {selectedLoadForMatching.goods.name} ({selectedLoadForMatching.goods.weight} Tons)
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => setActiveTab('dashboard')}>Back to Dashboard</button>
            </div>

            <h3 style={{ marginBottom: '1rem' }}>Recommended Available Drivers</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              {matchedDrivers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <AlertTriangle size={36} color="var(--warning)" style={{ marginBottom: '0.5rem' }} />
                  <p>No available drivers match this capacity/vehicle type right now.</p>
                </div>
              ) : (
                matchedDrivers.map(match => (
                  <div key={match.driver._id} className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: 'rgba(16, 185, 129, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        fontWeight: 'bold',
                        fontSize: '1.2rem'
                      }}>
                        {match.driver.driverName[0]}
                      </div>
                      <div>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {match.driver.driverName} 
                          <span style={{ fontSize: '0.8rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Star size={12} fill="var(--warning)" /> {match.driver.rating}
                          </span>
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Vehicle: {match.driver.vehicleNumber} ({match.driver.vehicleType}) | Cap: {match.driver.vehicleCapacity} Tons
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Proximity: <strong>{match.distance} KM away</strong> | Completed trips: {match.driver.tripsCount}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>Matching Score</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>{match.score}% Match</span>
                      </div>
                      
                      {/* Booking Action */}
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}
                        onClick={() => {
                          // Trigger accept from the driver side inside mock API
                          handleAcceptLoad(selectedLoadForMatching._id);
                        }}
                      >
                        Book Driver
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =============================================
            E. TRIP TRACKING & LIFE-CYCLE CONTROLLER
            ============================================= */}
        {activeTab === 'tracking' && selectedLoadDetails && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            
            {/* Left side details card */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="badge badge-transit" style={{ marginBottom: '0.5rem' }}>Trip ID: {activeTrip?._id || 'TRP_MOCK'}</span>
                  <h3>{selectedLoadDetails.load.goods.name} Transport Booking</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Company: ABC Foods Pvt Ltd</p>
                </div>
                <button className="btn btn-secondary" onClick={() => setActiveTab('dashboard')} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Back</button>
              </div>

              {/* Status Tracker State Line */}
              <div className="glass-card" style={{ padding: '1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Current Trip State</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <div className="pulsing-dot available"></div>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
                    {selectedLoadDetails.load.status.replace(/_/g, ' ')}
                  </strong>
                </div>
              </div>

              {/* Driver View lifecycle controls */}
              {role === 'driver' && activeTrip && (
                <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-driver)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Settings size={16} /> Driver Trip Controls
                  </h4>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {activeTrip.status === 'DRIVER_ASSIGNED' && (
                      <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-driver)' }} onClick={() => handleUpdateTripStatus(activeTrip._id, 'GOING_TO_PICKUP')}>
                        Going to Pickup
                      </button>
                    )}
                    {activeTrip.status === 'GOING_TO_PICKUP' && (
                      <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-driver)' }} onClick={() => handleUpdateTripStatus(activeTrip._id, 'ARRIVED_AT_PICKUP')}>
                        Arrived at Pickup
                      </button>
                    )}
                    {activeTrip.status === 'ARRIVED_AT_PICKUP' && (
                      <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-driver)' }} onClick={() => handleUploadProof(activeTrip._id, 'pickup')}>
                        <Upload size={14} /> Upload Cargo Proof & Load Goods
                      </button>
                    )}
                    {activeTrip.status === 'LOADED' && (
                      <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-driver)' }} onClick={() => handleUpdateTripStatus(activeTrip._id, 'IN_TRANSIT')}>
                        <Play size={14} /> Start Transit Route
                      </button>
                    )}
                    {activeTrip.status === 'IN_TRANSIT' && (
                      <div style={{ width: '100%' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textAlign: 'center' }}>
                          🚛 Location tracking simulation is running. The truck will progress automatically.
                        </p>
                        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => handleUpdateTripStatus(activeTrip._id, 'ARRIVED_AT_DESTINATION')}>
                          Fast-Forward Arrive Destination
                        </button>
                      </div>
                    )}
                    {activeTrip.status === 'ARRIVED_AT_DESTINATION' && (
                      <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--color-driver)' }} onClick={() => handleUploadProof(activeTrip._id, 'delivery')}>
                        <Upload size={14} /> Upload Delivery proof (Signature)
                      </button>
                    )}
                    {activeTrip.status === 'DELIVERED' && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', width: '100%', display: 'block' }}>
                        🏁 Delivered. Awaiting Company Confirmation & Payment.
                      </span>
                    )}
                    {activeTrip.status === 'COMPLETED' && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--primary)', textAlign: 'center', width: '100%', display: 'block', fontWeight: 'bold' }}>
                        ✅ Trip Completed Successfully! Payment Released.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Company Confirm Delivery Control */}
              {role === 'company' && activeTrip && activeTrip.status === 'DELIVERED' && (
                <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>📦 Delivery Verification Received</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    The driver has uploaded delivery proof. Please verify the shipment cargo and confirm to trigger payment release.
                  </p>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleConfirmDelivery(activeTrip._id)}>
                      Confirm Delivery & Release Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Cargo / Routing info details */}
              <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Pickup Details</span>
                  <p style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{selectedLoadDetails.load.pickup.location}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedLoadDetails.load.pickup.address}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Delivery Destination</span>
                  <p style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{selectedLoadDetails.load.delivery.location}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedLoadDetails.load.delivery.address}</p>
                </div>
              </div>

              {/* Cargo Details */}
              <div className="glass-card">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Cargo Details</span>
                <p style={{ fontSize: '0.85rem' }}>Goods: <strong>{selectedLoadDetails.load.goods.name}</strong> ({selectedLoadDetails.load.goods.category})</p>
                <p style={{ fontSize: '0.85rem' }}>Weight: {selectedLoadDetails.load.goods.weight} Tons | Qty: {selectedLoadDetails.load.goods.quantity} Packages</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{selectedLoadDetails.load.goods.description}</p>
              </div>

              {/* Driver/Company Info Contact */}
              {selectedLoadDetails.driver && (
                <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Assigned Truck & Driver</span>
                    <h5 style={{ fontSize: '0.9rem' }}>{selectedLoadDetails.driver.driverName}</h5>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vehicle: {selectedLoadDetails.driver.vehicleNumber}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={() => openChat(activeTrip._id)}>
                      <MessageSquare size={16} />
                    </button>
                    <a href={`tel:${selectedLoadDetails.driver.phone}`} className="btn btn-secondary" style={{ padding: '0.5rem' }}>
                      <Phone size={16} />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Right side Map Tracking Area */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>🗺️ Route Telemetry Map</h3>
                <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#F87171', fontSize: '0.7rem' }}>Demo GPS Connected</span>
              </div>

              {/* MAP VISUALIZATION CANVAS */}
              <div style={{
                flex: 1,
                minHeight: '350px',
                background: '#0d1527',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* SVG Route Line Drawer */}
                <svg width="90%" height="80%" viewBox="0 0 400 300" style={{ position: 'absolute', top: '10%', left: '5%' }}>
                  <defs>
                    <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0.2" />
                    </linearGradient>
                    <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#F59E0B" />
                    </linearGradient>
                  </defs>

                  {/* Draw the curve route path */}
                  <path 
                    d="M 50,250 Q 150,150 200,100 T 350,50" 
                    fill="none" 
                    stroke="url(#routeGrad)" 
                    strokeWidth="8"
                    strokeLinecap="round"
                  />

                  {/* Active travel progress path overlay */}
                  {activeTrip && (
                    <path 
                      d="M 50,250 Q 150,150 200,100 T 350,50" 
                      fill="none" 
                      stroke="url(#activeGrad)" 
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray="400"
                      // Interpolate dashoffset based on route progress index
                      strokeDashoffset={400 - (400 * ((activeTrip.simulatedRouteIndex || 0) / (ROUTE_POINTS.length - 1)))}
                      style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                    />
                  )}

                  {/* Render City Nodes */}
                  {ROUTE_POINTS.map((pt, idx) => {
                    // Approximate SVG coordinate mappings for route curve
                    const t = idx / (ROUTE_POINTS.length - 1);
                    // Q Bézier formula approximation
                    let x = 50 + t * 300;
                    // Simple path approximation for display
                    let y = 250 - t * 200;
                    if (idx === 0) { x = 50; y = 250; }
                    else if (idx === 1) { x = 90; y = 205; }
                    else if (idx === 2) { x = 130; y = 165; }
                    else if (idx === 3) { x = 170; y = 130; }
                    else if (idx === 4) { x = 200; y = 110; }
                    else if (idx === 5) { x = 230; y = 95; }
                    else if (idx === 6) { x = 270; y = 78; }
                    else if (idx === 7) { x = 310; y = 62; }
                    else if (idx === 8) { x = 350; y = 50; }

                    const isCurrent = activeTrip && activeTrip.simulatedRouteIndex === idx;
                    const isPassed = activeTrip && (activeTrip.simulatedRouteIndex || 0) >= idx;

                    return (
                      <g key={pt.name}>
                        <circle 
                          cx={x} 
                          cy={y} 
                          r={isCurrent ? 7 : 5} 
                          fill={isCurrent ? '#F59E0B' : isPassed ? '#10B981' : '#374151'} 
                          stroke="#0d1527" 
                          strokeWidth="2" 
                        />
                        {/* Only label Start, End, and Current */}
                        {(idx === 0 || idx === 8 || isCurrent) && (
                          <text 
                            x={x} 
                            y={y - 12} 
                            fill="#F3F4F6" 
                            fontSize="8" 
                            fontWeight="bold" 
                            textAnchor="middle"
                          >
                            {pt.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Animated Truck Overlay on top of current coordinate */}
                {activeTrip && (
                  <div style={{
                    position: 'absolute',
                    // Map the SVG index to position layout
                    left: `${5 + (((activeTrip.simulatedRouteIndex || 0) / (ROUTE_POINTS.length - 1)) * 80)}%`,
                    bottom: `${10 + (((activeTrip.simulatedRouteIndex || 0) / (ROUTE_POINTS.length - 1)) * 65)}%`,
                    transition: 'left 1s ease-in-out, bottom 1s ease-in-out',
                    transform: 'translate(-50%, 50%)',
                    zIndex: 10
                  }}>
                    <div style={{
                      backgroundColor: 'var(--color-driver)',
                      padding: '0.4rem',
                      borderRadius: '50%',
                      boxShadow: '0 0 15px rgba(245, 158, 11, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff'
                    }}>
                      <Truck size={18} />
                    </div>
                  </div>
                )}
              </div>

              {/* Map Metadata Telemetry Dashboard */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }} className="glass-card">
                <div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block' }}>REMAINING DISTANCE</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {activeTrip ? Math.max(0, 140 - ((activeTrip.simulatedRouteIndex || 0) * 16)) : '145'} KM
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block' }}>ESTIMATED SPEED</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>55 KM/H</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block' }}>ETA DURATION</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                    {activeTrip ? `${Math.ceil(Math.max(0, 140 - ((activeTrip.simulatedRouteIndex || 0) * 16)) / 55)} hrs` : '2.5 hrs'}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* =============================================
            F. CHAT PANEL (COMPANY <-> DRIVER)
            ============================================= */}
        {activeTab === 'messages' && activeChatTripId && (
          <div className="glass-panel" style={{ maxWidth: '800px', margin: '1rem auto', height: '550px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Chat Header */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>💬 Booking Logistics Chat</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trip Code: {activeChatTripId}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setActiveTab('dashboard')}>Back</button>
              </div>
            </div>

            {/* Quick action buttons for quick instructions sharing */}
            <div style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: '0.5rem', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', alignSelf: 'center', whiteSpace: 'nowrap' }}>Quick Instructions:</span>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }} onClick={() => handleSendInstructions("Please keep cargo covered with tarpaulin.")}>Cover Cargo</button>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }} onClick={() => handleSendInstructions("Deliver at Gate 4 Warehouse.")}>Gate 4 Delivery</button>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }} onClick={() => handleSendInstructions("Please coordinate with warehouse manager on arrival.")}>Manager Contact</button>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }} onClick={handleSendLocation}>📍 Share Location</button>
            </div>

            {/* Chat Messages Feed List */}
            <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0', fontSize: '0.85rem' }}>
                  No messages exchanged yet. Send a greeting to start coordinating.
                </div>
              ) : (
                chatMessages.map(msg => {
                  const isOwnMessage = msg.senderRole === role;
                  return (
                    <div 
                      key={msg._id} 
                      style={{
                        alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
                        maxWidth: '70%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isOwnMessage ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '2px', textTransform: 'capitalize' }}>
                        {msg.senderRole}
                      </span>
                      <div 
                        style={{
                          backgroundColor: isOwnMessage ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          borderTopRightRadius: isOwnMessage ? '0' : '12px',
                          borderTopLeftRadius: isOwnMessage ? '12px' : '0',
                          border: isOwnMessage ? 'none' : '1px solid var(--border-glass)',
                          fontSize: '0.85rem'
                        }}
                      >
                        {msg.type === 'location' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MapPin size={16} /> <span>Simulated GPS Location shared ({msg.location?.lat}, {msg.location?.lng})</span>
                          </div>
                        ) : msg.type === 'instruction' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#FBBF24', fontWeight: 'bold' }}>
                            <Info size={16} /> <span>{msg.text}</span>
                          </div>
                        ) : (
                          msg.text
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef}></div>
            </div>

            {/* Chat Send Input Box */}
            <form onSubmit={handleSendChatMessage} style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                placeholder="Type your message..." 
                value={newMessageText}
                onChange={e => setNewMessageText(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>
                <Send size={16} />
              </button>
            </form>
          </div>
        )}

        {/* =============================================
            G. DRIVER EARNINGS DETAILED PANEL
            ============================================= */}
        {role === 'driver' && activeTab === 'earnings' && driverEarnings && (
          <div className="glass-panel" style={{ maxWidth: '800px', margin: '1rem auto', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>💰 Driver Earnings Ledger</h2>
              <button className="btn btn-secondary" onClick={() => setActiveTab('dashboard')}>Back</button>
            </div>

            {/* Earnings grid highlights */}
            <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
              <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TODAY'S PAYOUT</span>
                <h3 style={{ fontSize: '1.75rem', color: 'var(--color-driver)', marginTop: '0.25rem' }}>₹{driverEarnings.today.toLocaleString()}</h3>
              </div>
              <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>THIS WEEK</span>
                <h3 style={{ fontSize: '1.75rem', color: 'var(--color-driver)', marginTop: '0.25rem' }}>₹{driverEarnings.thisWeek.toLocaleString()}</h3>
              </div>
              <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TOTAL MONTHLY</span>
                <h3 style={{ fontSize: '1.75rem', color: 'var(--color-driver)', marginTop: '0.25rem' }}>₹{driverEarnings.thisMonth.toLocaleString()}</h3>
              </div>
            </div>

            <h3 style={{ marginBottom: '1rem' }}>Completed Bookings Payout Log</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Trip ID</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Amount Transferred</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Payment Status</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Settlement Date</th>
                  </tr>
                </thead>
                <tbody>
                  {driverEarnings.history.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        No completed trip earnings recorded.
                      </td>
                    </tr>
                  ) : (
                    driverEarnings.history.map(pay => (
                      <tr key={pay.tripId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontWeight: 'bold' }}>{pay.tripId}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-company)' }}>₹{pay.amount.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem' }}><span className="badge badge-completed">Paid</span></td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(pay.date).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =============================================
            H. PLATFORM ADMIN DASHBOARD
            ============================================= */}
        {role === 'admin' && activeTab === 'dashboard' && (
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>👨💼 Platform Admin Console</h1>
            
            {/* Stats */}
            <div className="dashboard-grid">
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-admin)' }}>
                  <User size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{adminStats?.driversCount || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Drivers</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)' }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{adminStats?.verifiedDrivers || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Verified & Available</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-driver)' }}>
                  <Briefcase size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>{adminStats?.activeTrips || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active Trips</p>
                </div>
              </div>
              <div className="glass-panel stats-card">
                <div className="stats-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary)' }}>
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>₹{adminStats?.platformEarnings?.toLocaleString() || '0'}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Platform Share (10%)</p>
                </div>
              </div>
            </div>

            {/* Drivers Document verification queue */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>📋 Drivers Auditing & Document Verification Queue</h3>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Driver Details</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>License / Identity Docs</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Vehicle Profile</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Compliance Check</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Verification State</th>
                      <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Auditing Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminDrivers.map(drv => (
                      <tr key={drv._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          <p style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{drv.driverName}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{drv.phone} | {drv.email}</p>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', fontSize: '0.8rem' }}>
                          <p>DL: <strong>{drv.licenseNumber}</strong></p>
                          <p>UIDAI: <strong>{drv.aadhaarNumber}</strong></p>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', fontSize: '0.8rem' }}>
                          <p>Reg No: <strong>{drv.vehicleNumber}</strong></p>
                          <p>Spec: <strong>{drv.vehicleType} ({drv.vehicleCapacity} Tons)</strong></p>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--primary)', display: 'block' }}>✓ Insurance: Verified</span>
                          <span style={{ color: 'var(--primary)', display: 'block' }}>✓ PUC Compliance: Clean</span>
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          <span className={`badge badge-${drv.status.toLowerCase().replace(/ /g, '')}`}>
                            {drv.status}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 0.75rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {drv.status === 'Pending Verification' && (
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', backgroundColor: 'var(--color-company)' }}
                                onClick={() => handleVerifyDriver(drv._id)}
                              >
                                Approve Profile
                              </button>
                            )}
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderColor: drv.status === 'Suspended' ? 'var(--color-company)' : 'var(--danger)', color: drv.status === 'Suspended' ? '#10B981' : '#F87171' }}
                              onClick={() => handleToggleBlockDriver(drv._id)}
                            >
                              {drv.status === 'Suspended' ? 'Unsuspend' : 'Suspend User'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =============================================
            H. SUPABASE TODOS INTEGRATION PANEL
            ============================================= */}
        {activeTab === 'todos' && (
          <div className="glass-panel" style={{ maxWidth: '650px', margin: '1.5rem auto', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📋 Supabase Live Todos
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Connected database table: <code>todos</code> on Supabase
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => setActiveTab('dashboard')} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Back</button>
            </div>

            {/* Todo Input form */}
            <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
              <input 
                type="text" 
                placeholder="What needs to be done?" 
                value={newTodoName}
                onChange={e => setNewTodoName(e.target.value)}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.9rem' }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #10B981, #059669)', border: 'none' }}>
                Add Task
              </button>
            </form>

            {/* Todo List */}
            {loadingTodos ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <div style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '30px', height: '30px', margin: '0 auto 1rem' }}></div>
                Loading tasks from Supabase...
              </div>
            ) : todos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                No tasks found. Use the input box above to add your first live task.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {todos.map(todo => (
                  <div 
                    key={todo.id} 
                    className="glass-card" 
                    style={{ 
                      padding: '1rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      border: '1px solid rgba(255,255,255,0.05)',
                      background: todo.completed ? 'rgba(16, 185, 129, 0.03)' : 'rgba(255,255,255,0.02)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input 
                        type="checkbox" 
                        checked={!!todo.completed} 
                        onChange={() => handleToggleTodo(todo)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#10B981' }}
                      />
                      <span style={{ 
                        fontSize: '0.95rem', 
                        color: todo.completed ? 'var(--text-secondary)' : '#fff',
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        transition: 'all 0.3s ease'
                      }}>
                        {todo.name}
                      </span>
                    </div>
                    
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => handleDeleteTodo(todo.id)}
                      style={{ 
                        padding: '0.35rem 0.65rem', 
                        fontSize: '0.75rem', 
                        borderColor: 'transparent', 
                        color: '#F87171', 
                        backgroundColor: 'rgba(248, 113, 113, 0.08)'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              🎯 Changes will be immediately synchronized in real-time with your cloud database instance.
            </div>
          </div>
        )}

      </main>

      {/* =============================================
          POST NEW LOAD MODAL DIALOG (COMPANY)
          ============================================= */}
      {showPostLoadModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '700px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative'
          }}>
            <button 
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              onClick={() => setShowPostLoadModal(false)}
            >
              <X size={24} />
            </button>
            
            <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
              🚚 Post New Freight Load Request
            </h2>
            
            <form onSubmit={handlePostLoad}>
              {/* Pickup location fields */}
              <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '0.75rem' }}>1. Pickup Site Details</h3>
              <div className="form-group-grid" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Pickup Location City</label>
                  <input required type="text" value={pickupLoc} onChange={e => setPickupLoc(e.target.value)} />
                </div>
                <div>
                  <label>Date & Time</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input required type="text" value={pickupDate} onChange={e => setPickupDate(e.target.value)} style={{ flex: 1 }} />
                    <input required type="text" value={pickupTime} onChange={e => setPickupTime(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label>Exact Pickup Address</label>
                <input required type="text" value={pickupAddr} onChange={e => setPickupAddr(e.target.value)} />
              </div>

              {/* Delivery location fields */}
              <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '0.75rem' }}>2. Destination Details</h3>
              <div className="form-group-grid" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Delivery Location City</label>
                  <input required type="text" value={deliveryLoc} onChange={e => setDeliveryLoc(e.target.value)} />
                </div>
                <div>
                  <label>Expected Delivery Date</label>
                  <input required type="text" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label>Exact Delivery Address</label>
                <input required type="text" value={deliveryAddr} onChange={e => setDeliveryAddr(e.target.value)} />
              </div>

              {/* Cargo load description details */}
              <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '0.75rem' }}>3. Cargo Goods Specifications</h3>
              <div className="form-group-grid" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Goods Name</label>
                  <input required type="text" value={goodsName} onChange={e => setGoodsName(e.target.value)} />
                </div>
                <div>
                  <label>Goods Category</label>
                  <input required type="text" value={goodsCategory} onChange={e => setGoodsCategory(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Weight (Tons)</label>
                  <input required type="number" value={goodsWeight} onChange={e => setGoodsWeight(e.target.value)} />
                </div>
                <div>
                  <label>Packages Count</label>
                  <input required type="text" value={goodsPackages} onChange={e => setGoodsPackages(e.target.value)} />
                </div>
                <div>
                  <label>Quantity</label>
                  <input required type="number" value={goodsQuantity} onChange={e => setGoodsQuantity(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label>Cargo Description / Handling Info</label>
                <textarea rows="2" value={goodsDesc} onChange={e => setGoodsDesc(e.target.value)}></textarea>
              </div>

              {/* Truck details */}
              <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '0.75rem' }}>4. Truck Requirement</h3>
              <div className="form-group-grid" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Vehicle Body Requirement Type</label>
                  <select value={reqVehicleType} onChange={e => setReqVehicleType(e.target.value)}>
                    <option>10 Ton Truck</option>
                    <option>12 Ton Truck</option>
                    <option>Mini Truck</option>
                    <option>Pickup</option>
                    <option>Lorry</option>
                    <option>Container</option>
                    <option>Trailer</option>
                  </select>
                </div>
                <div>
                  <label>Minimum Capacity Required (Tons)</label>
                  <input required type="number" value={reqCapacity} onChange={e => setReqCapacity(e.target.value)} />
                </div>
              </div>

              {/* Price details */}
              <h3 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '0.75rem' }}>5. Price & Payout</h3>
              <div className="form-group-grid" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <label>Offered Price (INR)</label>
                  <input required type="number" value={offeredPrice} onChange={e => setOfferedPrice(e.target.value)} />
                </div>
                <div>
                  <label>Price Negotiability</label>
                  <select value={priceType} onChange={e => setPriceType(e.target.value)}>
                    <option>Fixed</option>
                    <option>Negotiable</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPostLoadModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Post Freight Load</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =============================================
          STAR RATING REVIEW DIALOG MODAL
          ============================================= */}
      {showRatingModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{ maxWidth: '450px', width: '100%', padding: '2rem', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>⭐ Rate Your Trip Experience</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Your feedback is important. Please rate the other party to close out this transaction.
            </p>

            {/* Rendering 5 clickable stars */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[1,2,3,4,5].map(star => (
                <button 
                  key={star} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setRatingStars(star)}
                >
                  <Star 
                    size={36} 
                    fill={star <= ratingStars ? 'var(--warning)' : 'none'} 
                    color={star <= ratingStars ? 'var(--warning)' : 'var(--text-secondary)'} 
                  />
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ textAlign: 'left' }}>Add Review Comment</label>
              <textarea 
                rows="3" 
                placeholder="Share your experience (e.g. prompt pickup, smooth transaction)..."
                value={ratingComment}
                onChange={e => setRatingComment(e.target.value)}
              ></textarea>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSubmitReview}>
              Submit Review
            </button>
          </div>
        </div>
      )}

      <footer style={{
        textAlign: 'center',
        padding: '1.5rem 0',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255,255,255,0.03)',
        marginTop: 'auto'
      }}>
        © 2026 LOGIX Goods Transport & Management Systems. All rights reserved.
      </footer>
    </div>
  );
}
