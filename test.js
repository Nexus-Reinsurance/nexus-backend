const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

const testAPI = async () => {
  try {
    console.log('🧪 Testing Login...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'demo@nexus.com'
    });
    
    console.log('✅ Login successful');
    const token = loginRes.data.token;
    
    console.log('\n🧪 Testing Dashboard...');
    const dashboardRes = await axios.get(`${API_URL}/dashboard/metrics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Dashboard metrics:', dashboardRes.data.metrics);
    
    console.log('\n🧪 Testing Treaties List...');
    const treatiesRes = await axios.get(`${API_URL}/treaties`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Treaties count:', treatiesRes.data.treaties.length);
    treatiesRes.data.treaties.forEach(t => {
      console.log(`   - ${t.name}: ${t.treaty_type} (${t.risk_level})`);
    });
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
};

testAPI();