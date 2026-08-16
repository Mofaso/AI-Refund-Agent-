import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, BarChart3, Terminal, FileText, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Metrics, RefundRequest, AgentLog } from '../types';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000';

interface AdminDashboardProps {
  activeSessionId: string;
}

export default function AdminDashboard({ activeSessionId }: AdminDashboardProps) {
  // Tabs: 'ops' (Escalations & KPIs), 'observability' (Reasoning logs), 'policy' (Rules document)
  const [activeTab, setActiveTab] = useState<'ops' | 'observability' | 'policy'>('ops');
  
  // Dashboard metrics
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Escalations queue
  const [escalations, setEscalations] = useState<RefundRequest[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Agent reasoning logs
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);

  // Fetch metrics & escalations on mount and when tab changes
  useEffect(() => {
    fetchMetrics();
    fetchEscalations();
  }, []);

  // Poll for agent reasoning logs if observability tab is open or if we are actively chatting
  useEffect(() => {
    let intervalId: any;
    
    if (activeSessionId) {
      fetchLogs(); // Initial fetch
      
      if (autoRefreshLogs) {
        intervalId = setInterval(() => {
          fetchLogs();
          fetchMetrics(); // keeps metrics updated as well!
        }, 2000);
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeSessionId, autoRefreshLogs]);

  // Fetch policy text once
  useEffect(() => {
    // We can simulate fetching the policy or make a call. Since it's stored in data, we can define a static preview
    // or load it. Let's provide a formatted summary in the UI directly for complete visual styling.
  }, []);

  const fetchMetrics = () => {
    fetch(`${API_URL}/api/admin/metrics`)
      .then((res) => res.json())
      .then((data) => {
        setMetrics(data);
        setMetricsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching metrics:', err);
        setMetricsLoading(false);
      });
  };

  const fetchEscalations = () => {
    setEscalationsLoading(true);
    fetch(`${API_URL}/api/admin/escalations`)
      .then((res) => res.json())
      .then((data) => {
        setEscalations(data);
        setEscalationsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching escalations:', err);
        setEscalationsLoading(false);
      });
  };

  const fetchLogs = () => {
    if (!activeSessionId) return;
    fetch(`${API_URL}/api/admin/logs?session_id=${activeSessionId}`)
      .then((res) => res.json())
      .then((data) => {
        setLogs(data);
      })
      .catch((err) => {
        console.error('Error fetching logs:', err);
      });
  };

  // Resolve an escalated ticket
  const handleResolveEscalation = async (requestId: string, status: 'APPROVED' | 'DENIED', adminComment: string) => {
    setResolvingId(requestId);
    try {
      const response = await fetch(`${API_URL}/api/admin/escalations/${requestId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status,
          reason: adminComment
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to resolve escalation');
      }

      // Refresh data
      fetchMetrics();
      fetchEscalations();
    } catch (err) {
      console.error('Error resolving escalation:', err);
      alert('Error updating database ticket.');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Control Tabs Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px', gap: '10px' }}>
        <button
          onClick={() => setActiveTab('ops')}
          className={`btn-secondary ${activeTab === 'ops' ? 'active' : ''}`}
          style={{
            borderColor: activeTab === 'ops' ? 'var(--primary)' : 'var(--border)',
            background: activeTab === 'ops' ? 'rgba(138,92,246,0.05)' : 'none',
            fontSize: '13px',
            padding: '8px 16px',
            borderRadius: '8px'
          }}
        >
          <BarChart3 size={15} /> Operations Queue & KPIs
        </button>
        
        <button
          onClick={() => setActiveTab('observability')}
          className={`btn-secondary ${activeTab === 'observability' ? 'active' : ''}`}
          style={{
            borderColor: activeTab === 'observability' ? 'var(--accent)' : 'var(--border)',
            background: activeTab === 'observability' ? 'rgba(6,182,212,0.05)' : 'none',
            fontSize: '13px',
            padding: '8px 16px',
            borderRadius: '8px'
          }}
        >
          <Terminal size={15} /> Agent Reasoning Stream
        </button>
        
        <button
          onClick={() => setActiveTab('policy')}
          className={`btn-secondary ${activeTab === 'policy' ? 'active' : ''}`}
          style={{
            borderColor: activeTab === 'policy' ? 'var(--primary)' : 'var(--border)',
            background: activeTab === 'policy' ? 'rgba(255,255,255,0.02)' : 'none',
            fontSize: '13px',
            padding: '8px 16px',
            borderRadius: '8px'
          }}
        >
          <FileText size={15} /> Corporate Policies
        </button>
      </div>

      {/* TAB CONTENT: OPERATIONS QUEUE & KPIs */}
      {activeTab === 'ops' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '4px' }}>
          
          {/* Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {metricsLoading ? (
              <div style={{ gridColumn: 'span 4', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading statistics...</div>
            ) : metrics ? (
              <>
                <div className="glass-card" style={{ borderLeft: '3px solid var(--accent)', padding: '14px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Refunds Submitted</p>
                  <h4 style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{metrics.total_refunds_submitted}</h4>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Evaluated by agent loop</span>
                </div>
                
                <div className="glass-card" style={{ borderLeft: '3px solid #22c55e', padding: '14px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Auto-Approved (AI)</p>
                  <h4 style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#4ade80' }}>{metrics.approved_refunds}</h4>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Order records updated</span>
                </div>
                
                <div className="glass-card" style={{ borderLeft: '3px solid var(--danger)', padding: '14px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Auto-Denied (AI)</p>
                  <h4 style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#f87171' }}>{metrics.denied_refunds}</h4>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Citing policy violations</span>
                </div>
                
                <div style={{ borderLeft: '3px solid #f97316', padding: '14px' }} className={`glass-card ${metrics.escalated_refunds > 0 ? 'pulse-danger' : ''}`}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Pending Escalation</p>
                  <h4 style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#fb923c' }}>{metrics.escalated_refunds}</h4>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Awaiting Human-in-the-Loop</span>
                </div>
              </>
            ) : null}
          </div>

          {/* Financial summary card */}
          {metrics && (
            <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, rgba(138, 92, 246, 0.04) 0%, rgba(6, 182, 212, 0.04) 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>TOTAL CREDITED REFUND CASHOUT</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Financial balance processed successfully under corporate rules.</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h3 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                  ${metrics.total_amount_refunded.toFixed(2)}
                </h3>
              </div>
            </div>
          )}

          {/* Escalation Queue Title */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={18} color="#fb923c" /> Human-in-the-Loop Escalation Queue
              </h3>
              <button onClick={fetchEscalations} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '6px' }}>
                <RefreshCw size={10} /> Refresh Queue
              </button>
            </div>

            {/* Queue List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {escalationsLoading ? (
                <div style={{ color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }}>Loading escalation list...</div>
              ) : escalations.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                  <ShieldCheck size={36} color="#4ade80" style={{ margin: '0 auto 10px auto', opacity: 0.8 }} />
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Queue is Clear</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    There are no pending refund escalations. Gemini handles all standard ticket volumes automatically!
                  </p>
                </div>
              ) : (
                escalations.map((req) => (
                  <div key={req.id} className="glass-card animate-fade-in" style={{ borderLeft: '4px solid #fb923c' }}>
                    
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TICKET ID: </span>
                        <strong style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{req.id}</strong>
                      </div>
                      <span className="badge badge-escalated">Pending Admin Resolve</span>
                    </div>

                    {/* Meta info grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Customer: </span>
                        <strong>{req.customer_id}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Order ID: </span>
                        <strong>#{req.order_id}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Escalated Value: </span>
                        <strong style={{ color: 'var(--accent)', fontSize: '13px' }}>${req.amount.toFixed(2)}</strong>
                      </div>
                    </div>

                    {/* Requested items info */}
                    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '6px', padding: '10px', marginBottom: '12px', fontSize: '12px' }}>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Items Flagged for Refund:
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {req.items.map((it) => (
                          <div key={it.item_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{it.name} {it.is_final_sale && <strong style={{ color: 'var(--danger)' }}>(FINAL SALE)</strong>}</span>
                            <span>${it.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Agent Justification */}
                    <div style={{ marginBottom: '14px', fontSize: '12px', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '8px' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Gemini Reasoning Justification:</span>
                      <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{req.reason}"</p>
                    </div>

                    {/* Admin Action Form */}
                    <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '12px' }}>
                      <input
                        type="text"
                        placeholder="Provide reasoning for override/resolution..."
                        id={`comment-${req.id}`}
                        style={{ flex: 1, height: '36px', padding: '0 12px', fontSize: '12px' }}
                      />
                      <button
                        onClick={() => {
                          const commentInput = document.getElementById(`comment-${req.id}`) as HTMLInputElement;
                          handleResolveEscalation(req.id, 'APPROVED', commentInput?.value || 'Approved by administrator');
                        }}
                        disabled={resolvingId === req.id}
                        className="btn-primary"
                        style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: 'none', height: '36px', padding: '0 16px', fontSize: '12px' }}
                      >
                        <CheckCircle2 size={14} /> Approve Refund
                      </button>
                      <button
                        onClick={() => {
                          const commentInput = document.getElementById(`comment-${req.id}`) as HTMLInputElement;
                          handleResolveEscalation(req.id, 'DENIED', commentInput?.value || 'Denied by administrator');
                        }}
                        disabled={resolvingId === req.id}
                        className="btn-secondary"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', height: '36px', padding: '0 16px', fontSize: '12px' }}
                      >
                        <XCircle size={14} /> Deny Refund
                      </button>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: AGENT REASONING STREAM (LLM OBSERVABILITY) */}
      {activeTab === 'observability' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Header controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={18} color="var(--accent)" /> Real-Time Decision Reasoning Logs
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Monitoring Session: <strong style={{ color: 'var(--text-primary)' }}>{activeSessionId || 'None (No active conversation)'}</strong>
              </p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoRefreshLogs}
                  onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                />
                Auto-Refresh Stream (2s)
              </label>
              <button onClick={fetchLogs} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '6px' }}>
                <RefreshCw size={10} /> Sync Logs
              </button>
            </div>
          </div>

          {/* Reasoning stream scroll container */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
            {!activeSessionId ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Terminal size={40} style={{ opacity: 0.4, marginBottom: '10px' }} />
                <p>No active chat session. Start typing in the Customer portal to initialize the reasoning log stream!</p>
              </div>
            ) : logs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={30} className="animate-spin" style={{ opacity: 0.5, marginBottom: '10px' }} />
                <p>Waiting for agent reasoning logs... Send a message to start streaming.</p>
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={log.id || idx} className="glass-card animate-fade-in" style={{ padding: '14px', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
                  
                  {/* Step Banner */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
                      🔍 AGENT THINKING BLOCK - STEP {log.step_index + 1}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Inner Thought */}
                  {log.thought && (
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Inner Thoughts / Reasoning Path:</span>
                      <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                        {log.thought}
                      </p>
                    </div>
                  )}

                  {/* Tool execution block (simulated terminal) */}
                  {log.tool_calls && log.tool_calls.length > 0 && (
                    <div style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px', marginTop: '10px' }}>
                      {log.tool_calls.map((call, cIdx) => {
                        const responseObj = log.tool_responses?.find(r => r.name === call.name);
                        const displayResponse = responseObj ? responseObj.output : 'Pending...';
                        
                        return (
                          <div key={cIdx} style={{ marginBottom: '10px' }}>
                            <div style={{ color: '#c084fc', marginBottom: '4px' }}>
                              <span>&gt; Executed Tool: </span>
                              <strong style={{ color: '#818cf8' }}>{call.name}()</strong>
                            </div>
                            
                            <div style={{ color: 'var(--text-secondary)', paddingLeft: '12px', borderLeft: '1px dashed rgba(255,255,255,0.1)', marginBottom: '6px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Arguments:</span>
                              <pre style={{ overflowX: 'auto', color: '#22d3ee', margin: '2px 0 0 0' }}>
                                {JSON.stringify(call.args, null, 2)}
                              </pre>
                            </div>

                            <div style={{ color: 'var(--text-secondary)', paddingLeft: '12px', borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Return Output:</span>
                              <pre style={{ overflowX: 'auto', color: '#4ade80', margin: '2px 0 0 0', maxHeight: '180px', overflowY: 'auto' }}>
                                {JSON.stringify(displayResponse, null, 2)}
                              </pre>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Final reply check */}
                  {log.final_response && (
                    <div style={{ marginTop: '10px', background: 'rgba(34,197,94,0.04)', border: '1px dashed rgba(34,197,94,0.2)', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4ade80', textTransform: 'uppercase', marginBottom: '2px' }}>
                        Decision Finalized: Reply Stream Sent to Chat
                      </span>
                      <p style={{ color: 'var(--text-primary)' }}>"{log.final_response}"</p>
                    </div>
                  )}

                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: CORPORATE POLICIES VIEW */}
      {activeTab === 'policy' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="animate-fade-in">
          
          <div className="glass-card" style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--accent)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={16} /> SYSTEM REFUND POLICIES (ACTIVE MANDATE)
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              These rules are injected directly into the Gemini LLM system prompts. The agent queries them programmatically as a tool (`read_refund_policy`) to cross-reference every customer return request.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '24px', fontFamily: 'var(--font-body)', fontSize: '14px', lineHeight: '1.6' }}>
            
            <h2 style={{ fontSize: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px', color: 'var(--text-primary)', textAlign: 'center', fontFamily: 'var(--font-display)' }}>
              WORKNOON E-COMMERCE REFUND RULES DIRECTIVE
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <strong style={{ color: 'var(--primary)' }}>Rule 1: Return Timelines & Customer Loyalty Tiers</strong>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  Standard returns must be requested within **30 days** of delivery. However, **VIP loyalty tier** customers receive an extended **45 days** window. Returns requested after these thresholds are automatically denied.
                </p>
              </div>

              <div>
                <strong style={{ color: 'var(--primary)' }}>Rule 2: Shipment Delivery Requirement</strong>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  Items can only be evaluated for refund once their shipment is formally **Delivered**. Orders currently marked as "Shipped" or "Processing" are strictly ineligible for refund until delivery is completed.
                </p>
              </div>

              <div>
                <strong style={{ color: 'var(--primary)' }}>Rule 3: Non-Refundable Product Classes (Strict Deny)</strong>
                <ul style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>Items marked as **Final Sale** at the time of purchase.</li>
                  <li>Digital downloads, codes, software, or issued licenses.</li>
                  <li>Personalized, hygiene, or tailored custom clothing items.</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: 'var(--primary)' }}>Rule 4: Financial Approval Escalation Limit ($500)</strong>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  The AI agent has a hard limit: any refund request where the requested items total **over $500.00 USD** cannot be auto-approved. It must register the ticket as **ESCALATED** and queue it for Human Admin review, citing the policy threshold.
                </p>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '6px', marginTop: '10px' }}>
                <strong style={{ color: '#fb7171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🛡️ Security Safeguard: Prompt Injection Resistance
                </strong>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                  Gemini is strictly instructed to disregard adversarial instructions attempting to hijack policy logic. Aggressive customer statements, developer overrides, or "debug system bypass" queries are logged, flagged, and politely ignored.
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
