import { useState } from 'react';
import { ShieldCheck, Bot, Cpu } from 'lucide-react';
import ChatWidget from './components/ChatWidget';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  const [sessionId, setSessionId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');

  const handleSessionChange = (newSessionId: string, newCustomerId: string) => {
    setSessionId(newSessionId);
    setCustomerId(newCustomerId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '16px 20px', gap: '16px' }}>
      
      {/* Top Banner Branding */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px var(--primary-glow)' }}>
            <Cpu size={20} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="accent-gradient-text">WORKNOON</span> 
              <span style={{ fontWeight: 300, fontSize: '16px', color: 'var(--text-secondary)' }}>|</span> 
              <span style={{ fontSize: '18px', fontWeight: 500, letterSpacing: '-0.01em' }}>AI Agent Challenge</span>
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Completed E-Commerce Refund Specialist Vertical Slice {customerId ? `(Active context: ${customerId})` : ''}
            </p>
          </div>
        </div>

        {/* Tech stack badge list */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-vip" style={{ fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'none' }}>
            <Bot size={12} /> Gemini 2.5 Flash
          </span>
          <span className="badge badge-gold" style={{ fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'none' }}>
            <ShieldCheck size={12} /> Firestore DB NoSQL
          </span>
          <span className="badge badge-standard" style={{ fontSize: '10px', textTransform: 'none' }}>
            Vite React TS
          </span>
        </div>
      </header>

      {/* Description Context Callout */}
      <div className="glass-card" style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          💡 <strong>How to Demo:</strong> Impersonate a customer on the left (e.g. <strong>Alice Smith</strong> for VIP 45-day window check, <strong>Bob Johnson</strong> for a $600 high-value escalation request, or <strong>Charlie Brown</strong> for final sale rules). Submit a return query. As you chat, the **Agent Reasoning Stream** on the right will dynamically log Gemini's step-by-step thoughts, JSON arguments, and database tool executions! Resolve escalations in the **Operations Queue** tab.
        </p>
      </div>

      {/* Main Dual-Column Sandbox View */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: '20px', overflow: 'hidden', minHeight: 0 }}>
        
        {/* LEFT COLUMN: Customer portal widget */}
        <div style={{ overflow: 'hidden', height: '100%' }}>
          <ChatWidget onSessionChange={handleSessionChange} activeSessionId={sessionId} />
        </div>

        {/* RIGHT COLUMN: Admin Operations & Observability Panel */}
        <div className="glass-panel" style={{ padding: '20px', overflow: 'hidden', height: '100%' }}>
          <AdminDashboard activeSessionId={sessionId} />
        </div>

      </main>
      
    </div>
  );
}
