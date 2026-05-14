import React, { useState, useEffect } from 'react';
import { Mail, Plus, Send, AlertCircle, Clock, BarChart3, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://mailsentbackend-production.up.railway.app';
const socket = io(API_BASE_URL);

export default function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    engagement: 0
  });

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
    provider: 'smtp',
    delay: 2,
    scheduledAt: ''
  });

  const [recipientsFile, setRecipientsFile] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const [health, setHealth] = useState({
    smtp: 'Checking...',
    socket: 'Disconnected',
    database: 'Checking...'
  });

  useEffect(() => {
    fetchStats();

    socket.on('connect', () => {
      setHealth(prev => ({ ...prev, socket: 'Connected' }));
      socket.emit('check_health');
    });

    if (socket.connected) {
      setHealth(prev => ({ ...prev, socket: 'Connected' }));
      socket.emit('check_health');
    }

    socket.on('disconnect', () => {
      setHealth(prev => ({ ...prev, socket: 'Disconnected' }));
    });

    socket.on('health_status', (data) => {
      setHealth(prev => ({
        ...prev,
        smtp: data.smtp === 'connected' ? 'Synced' : 'Error',
        database: data.mongodb === 'connected' ? 'Synced' : (data.mongodb === 'fallback (sqlite)' ? 'Fallback' : 'Disconnected'),
        smtpError: data.smtp_error
      }));
    });

    socket.on('campaign_progress', (data) => {
      setCampaigns(prev => prev.map(c =>
        c._id === data.campaign_id ? { ...c, progress: data.progress, sent_count: data.sent, failed_count: data.failed } : c
      ));
    });

    const healthInterval = setInterval(() => {
      if (socket.connected) socket.emit('check_health');
    }, 10000);

    return () => {
      socket.off('campaign_progress');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('health_status');
      clearInterval(healthInterval);
    };
  }, []);

  const checkHealth = () => {
    if (socket.connected) socket.emit('check_health');
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/campaigns/stats`);
      setCampaigns(res.data);

      const totalSent = res.data.reduce((acc, curr) => acc + (curr.sent_count || 0), 0);
      const totalFailed = res.data.reduce((acc, curr) => acc + (curr.failed_count || 0), 0);
      const totalOpened = res.data.reduce((acc, curr) => acc + (curr.opened_by?.length || 0), 0);

      setStats({
        total: totalSent + totalFailed,
        sent: totalSent,
        failed: totalFailed,
        engagement: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLaunch = async (e) => {
    e.preventDefault();
    if (!recipientsFile) return toast.error("Please select a recipients file");

    setLoading(true);
    const data = new FormData();
    data.append('name', formData.name);
    data.append('subject', formData.subject);
    data.append('body', formData.body);
    data.append('provider', formData.provider);
    data.append('delay', formData.delay);
    data.append('scheduled_at', formData.scheduledAt);
    data.append('recipients', recipientsFile);
    attachments.forEach(file => data.append('attachments', file));

    try {
      await axios.post(`${API_BASE_URL}/api/campaigns/create`, data);
      toast.success("Campaign launched!");
      setShowModal(false);
      setTimeout(fetchStats, 1000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Launch failed. Check your connection.";
      toast.error(errorMsg);
      console.error("Launch error:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-box">
            <Mail size={24} color="white" />
          </div>
          <div className="logo-text">
            <h1>BulkMail <span style={{ color: '#a78bfa' }}>Pro</span> <span className="logo-dot"></span></h1>
            <p>Enterprise Campaign Dashboard</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-create">
          <Plus size={18} /> Create Campaign
        </button>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          icon={<Send size={20} />}
          trend="+12% FROM LAST WEEK"
          label="Total Dispatched"
          value={stats.sent}
        />
        <StatCard
          icon={<AlertCircle size={20} color="#ef4444" />}
          trend="ACTION REQUIRED"
          label="Delivery Failures"
          value={stats.failed}
        />
        <StatCard
          icon={<Clock size={20} color="#f59e0b" />}
          trend="PROCESSING..."
          label="In Queue"
          value={campaigns.filter(c => c.status === 'processing').length}
        />
        <StatCard
          icon={<BarChart3 size={20} color="#10b981" />}
          trend="TOP PERFORMING"
          label="Engagement"
          value={`${stats.engagement}%`}
        />
      </div>

      <div className="main-content">
        {/* Active Campaigns */}
        <div>
          <div className="section-header">
            <h2>Active Campaigns</h2>
            <span className="section-subtitle">Showing {campaigns.length} campaigns</span>
          </div>

          <div className="campaign-container">
            {campaigns.length === 0 ? (
              <>
                <Mail size={40} style={{ marginBottom: '20px', opacity: 0.2 }} />
                <p>No campaigns found. Start your first campaign to see results here!</p>
              </>
            ) : (
              <div style={{ width: '100%', textAlign: 'left' }}>
                {campaigns.map(c => (
                  <div key={c._id} style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '15px', marginBottom: '15px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'between', marginBottom: '10px' }}>
                      <span style={{ fontWeight: '600' }}>{c.name}</span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', marginLeft: 'auto' }}>{c.status.toUpperCase()}</span>
                    </div>
                    <div style={{ height: '6px', background: '#0b0d17', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ width: `${c.progress}%`, height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* System Health */}
        <div>
          <div className="section-header">
            <h2>System Health</h2>
          </div>
          <div className="health-card">
            <HealthItem
              label="SMTP Server"
              status={health.smtp}
              active={health.smtp === 'Synced'}
              color={health.smtp === 'Synced' ? '#10b981' : (health.smtp === 'Checking...' ? '#f59e0b' : '#ef4444')}
            />
            <HealthItem
              label="Socket Connection"
              status={health.socket}
              active={health.socket === 'Connected'}
              color={health.socket === 'Connected' ? '#10b981' : '#ef4444'}
            />
            <HealthItem
              label="Database"
              status={health.database}
              active={health.database === 'Synced'}
              color={health.database === 'Synced' ? '#10b981' : (health.database === 'Fallback' ? '#f59e0b' : '#ef4444')}
            />

            {health.smtpError && (
              <div className="warning-box">
                <p className="warning-text">
                  SMTP Warning: {health.smtpError}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="modal-overlay">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="modal-content"
            >
              <button onClick={() => setShowModal(false)} className="modal-close"><X /></button>
              <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '10px' }}>New Campaign</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '30px' }}>Configure your message and recipients</p>

              <form onSubmit={handleLaunch}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Campaign Name</label>
                    <input
                      className="form-input" placeholder="e.g. Q2 Product Launch"
                      value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Subject</label>
                    <input
                      className="form-input" placeholder="Catchy subject line..."
                      value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Content</label>
                  <textarea
                    className="form-input" rows="5" placeholder="Write your email here... Use {{name}} for personalization"
                    value={formData.body} onChange={e => setFormData({ ...formData, body: e.target.value })}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Schedule (Optional)</label>
                    <input
                      type="datetime-local" className="form-input"
                      value={formData.scheduledAt} onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })}
                    />
                  </div>
                </div>

                <div className="dropzone-container" style={{ marginBottom: '30px' }}>
                  <div className="dropzone">
                    <p>Recipients (CSV/Excel)</p>
                    <input type="file" onChange={e => setRecipientsFile(e.target.files[0])} style={{ marginTop: '10px', fontSize: '10px' }} />
                  </div>
                  <div className="dropzone">
                    <p>Attachments</p>
                    <input type="file" multiple onChange={e => setAttachments(Array.from(e.target.files))} style={{ marginTop: '10px', fontSize: '10px' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                  <button type="submit" className="btn-create" disabled={loading}>
                    {loading ? 'Launching...' : 'Launch Now'} <Send size={16} />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, trend, label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <div className="stat-icon">{icon}</div>
        <div className="stat-trend">{trend}</div>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function HealthItem({ label, status, active, color }) {
  return (
    <div className="health-item">
      <span className="health-label">{label}</span>
      <div className="health-status" style={{ color: color }}>
        <span className="dot" style={{ background: color }}></span>
        {status}
      </div>
    </div>
  );
}
