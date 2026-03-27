import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  Zap, 
  Plus, 
  Trash2, 
  Edit2, 
  Play, 
  Pause, 
  ChevronRight,
  Settings,
  AlertCircle
} from 'lucide-react';
import { api } from '../lib/api';
import { ActionButton } from '../components/ActionButton';
import { SectionCard } from '../components/SectionCard';

const SENSORS = [
  { value: 'soilPercent', label: 'Soil Moisture (%)' },
  { value: 'airTempC', label: 'Air Temp (°C)' },
  { value: 'humidity', label: 'Humidity (%)' },
  { value: 'lux', label: 'Light (Lux)' },
  { value: 'mqPPM', label: 'Gas (PPM)' },
  { value: 'weightG', label: 'Weight (g)' },
  { value: 'rootTempC', label: 'Root Temp (°C)' }
];

const ACTUATORS = [
  { value: 'water', label: 'Water Pump' },
  { value: 'fan', label: 'Ventilation Fan' },
  { value: 'light', label: 'Grow Light' }
];

export default function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    conditions: [{ sensor: 'soilPercent', operator: '<', value: 30 }],
    action: { actuator: 'water', command: 'on' },
    durationMinutes: 5,
    cooldownMinutes: 30
  });

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    try {
      const res = await api.getAutomationRules();
      if (res.success) setRules(res.data);
    } catch (e) {
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }

  const handleToggleStatus = async (rule) => {
    const newStatus = rule.status === 'active' ? 'paused' : 'active';
    try {
      const res = await api.updateAutomationRule(rule._id, { status: newStatus });
      if (res.success) {
        setRules(rules.map(r => r._id === rule._id ? res.data : r));
        toast.success(`Rule ${newStatus === 'active' ? 'enabled' : 'paused'}`);
      }
    } catch (e) {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      const res = await api.deleteAutomationRule(id);
      if (res.success) {
        setRules(rules.filter(r => r._id !== id));
        toast.success('Rule deleted');
      }
    } catch (e) {
      toast.error('Failed to delete rule');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let res;
      if (editingRule) {
        res = await api.updateAutomationRule(editingRule._id, formData);
      } else {
        res = await api.createAutomationRule(formData);
      }
      
      if (res.success) {
        toast.success(editingRule ? 'Rule updated' : 'Rule created');
        fetchRules();
        closeModal();
      }
    } catch (e) {
      toast.error('Failed to save rule');
    }
  };

  const openModal = (rule = null) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        description: rule.description || '',
        conditions: rule.conditions,
        action: rule.action,
        durationMinutes: rule.durationMinutes,
        cooldownMinutes: rule.cooldownMinutes
      });
    } else {
      setEditingRule(null);
      setFormData({
        name: '',
        description: '',
        conditions: [{ sensor: 'soilPercent', operator: '<', value: 30 }],
        action: { actuator: 'water', command: 'on' },
        durationMinutes: 5,
        cooldownMinutes: 30
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRule(null);
  };

  const addCondition = () => {
    setFormData({
      ...formData,
      conditions: [...formData.conditions, { sensor: 'soilPercent', operator: '<', value: 0 }]
    });
  };

  const removeCondition = (index) => {
    setFormData({
      ...formData,
      conditions: formData.conditions.filter((_, i) => i !== index)
    });
  };

  const updateCondition = (index, field, value) => {
    const newConditions = [...formData.conditions];
    newConditions[index][field] = value;
    setFormData({ ...formData, conditions: newConditions });
  };

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--automation">
        <div>
          <span className="hero-panel__eyebrow">Expert Systems</span>
          <h1>Plant Automation Rules</h1>
          <p>
            Define logical triggers and automated actions to maintain the perfect botanical environment without manual intervention.
          </p>
          <div className="control-cluster">
            <ActionButton tone="emerald" onClick={() => openModal()}>
              <Plus /> Create New Rule
            </ActionButton>
          </div>
        </div>
        <div className="hero-panel__status-cluster">
          <span className="status-chip status-chip--live">
            <span className="status-chip__dot" />
            {rules.filter(r => r.status === 'active').length} Active Rules
          </span>
          <span className="status-chip status-chip--reachable">
            <span className="status-chip__dot" />
            Edge Automation Ready
          </span>
        </div>
      </section>

      <div className="section-grid">
        <SectionCard eyebrow="Logic Engine" title="Current Automation Rules">
          {loading ? (
             <div className="placeholder-text">Syncing rules...</div>
          ) : rules.length === 0 ? (
             <div className="placeholder-text">No rules defined yet. Click "Create New Rule" to start.</div>
          ) : (
            <div className="rules-list">
              {rules.map(rule => (
                <div key={rule._id} className={`rule-item ${rule.status === 'paused' ? 'rule-item--paused' : ''}`}>
                  <div className="rule-item__main">
                    <div className="rule-item__header">
                      <h3>{rule.name}</h3>
                      <div className="rule-tag-row">
                         <span className={`status-tag status-tag--${rule.status}`}>
                           {rule.status.toUpperCase()}
                         </span>
                         {rule.isDefault && <span className="status-tag status-tag--info">SYSTEM</span>}
                      </div>
                    </div>
                    <p className="rule-item__desc">{rule.description}</p>
                    
                    <div className="rule-logic-display">
                      <div className="rule-logic-group">
                        <span className="logic-label">IF</span>
                        <div className="logic-conditions">
                          {rule.conditions.map((c, i) => (
                            <span key={i} className="logic-badge logic-badge--condition">
                              {SENSORS.find(s => s.value === c.sensor)?.label} {c.operator} {c.value}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="logic-arrow" />
                      <div className="rule-logic-group">
                        <span className="logic-label">THEN</span>
                        <span className="logic-badge logic-badge--action">
                          {ACTUATORS.find(a => a.value === rule.action.actuator)?.label} {rule.action.command.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rule-item__actions">
                    <button 
                      className="btn btn--ghost btn--sm" 
                      onClick={() => handleToggleStatus(rule)}
                      title={rule.status === 'active' ? 'Pause' : 'Resume'}
                    >
                      {rule.status === 'active' ? <Pause /> : <Play />}
                    </button>
                    <button 
                      className="btn btn--ghost btn--sm" 
                      onClick={() => openModal(rule)}
                      title="Edit"
                    >
                      <Edit2 />
                    </button>
                    <button 
                      className="btn btn--ghost btn--danger btn--sm" 
                      onClick={() => handleDelete(rule._id)}
                      title="Delete"
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-content--lg">
            <div className="modal-header">
              <h2>{editingRule ? 'Edit Automation Rule' : 'New Automation Rule'}</h2>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="rule-form">
              <div className="form-group">
                <label>Rule Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Morning Mist Cycle"
                  required 
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Briefly explain what this rule does..."
                />
              </div>

              <div className="form-section">
                <div className="form-section__header">
                  <h4>Conditions (IF)</h4>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={addCondition}>
                    <Plus /> Add Condition
                  </button>
                </div>
                <div className="conditions-builder">
                  {formData.conditions.map((condition, idx) => (
                    <div key={idx} className="condition-row">
                      <select 
                        value={condition.sensor}
                        onChange={e => updateCondition(idx, 'sensor', e.target.value)}
                      >
                        {SENSORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <select 
                        value={condition.operator}
                        onChange={e => updateCondition(idx, 'operator', e.target.value)}
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value="==">==</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                      </select>
                      <input 
                        type="number" 
                        value={condition.value}
                        onChange={e => updateCondition(idx, 'value', parseFloat(e.target.value))}
                      />
                      <button 
                        type="button" 
                        className="btn btn--ghost btn--danger btn--sm"
                        onClick={() => removeCondition(idx)}
                        disabled={formData.conditions.length === 1}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h4>Action (THEN)</h4>
                <div className="action-builder">
                  <select 
                    value={formData.action.actuator}
                    onChange={e => setFormData({...formData, action: {...formData.action, actuator: e.target.value}})}
                  >
                    {ACTUATORS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <select 
                    value={formData.action.command}
                    onChange={e => setFormData({...formData, action: {...formData.action, command: e.target.value}})}
                  >
                    <option value="on">TURN ON</option>
                    <option value="off">TURN OFF</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (Minutes)</label>
                  <input 
                    type="number" 
                    value={formData.durationMinutes}
                    onChange={e => setFormData({...formData, durationMinutes: parseInt(e.target.value)})}
                  />
                  <small>0 for indefinite</small>
                </div>
                <div className="form-group">
                  <label>Cooldown (Minutes)</label>
                  <input 
                    type="number" 
                    value={formData.cooldownMinutes}
                    onChange={e => setFormData({...formData, cooldownMinutes: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn--secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn--emerald">
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .rules-list { display: flex; flex-direction: column; gap: 1rem; }
        .rule-item {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rule-item:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
          box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        }
        .rule-item--paused { opacity: 0.6; filter: grayscale(0.5); border-style: dashed; }
        
        .rule-item__main { flex: 1; }
        .rule-item__header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
        .rule-item__header h3 { margin: 0; font-size: 1.1rem; color: var(--primary); }
        .rule-tag-row { display: flex; gap: 0.5rem; }
        .rule-item__desc { font-size: 0.9rem; opacity: 0.7; margin-bottom: 1.25rem; }

        .rule-logic-display {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          background: var(--bg-tertiary);
          padding: 1rem;
          border-radius: 12px;
          width: fit-content;
        }
        .rule-logic-group { display: flex; align-items: center; gap: 0.8rem; }
        .logic-label { font-size: 0.75rem; font-weight: bold; opacity: 0.5; text-transform: uppercase; }
        .logic-badge {
          font-size: 0.85rem;
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-family: var(--font-mono);
        }
        .logic-badge--condition { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
        .logic-badge--action { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }
        .logic-arrow { opacity: 0.3; }

        .rule-item__actions { display: flex; gap: 0.5rem; }

        .status-tag { font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; }
        .status-tag--active { background: #065f46; color: #34d399; }
        .status-tag--paused { background: #4b5563; color: #d1d5db; }
        .status-tag--info { background: #1e3a8a; color: #93c5fd; }

        .rule-form { display: grid; gap: 1.5rem; margin-top: 1rem; }
        .conditions-builder { display: flex; flex-direction: column; gap: 0.8rem; }
        .condition-row { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.8rem; align-items: center; }
        .action-builder { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
        .form-section__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .form-section h4 { margin: 0; font-size: 0.9rem; opacity: 0.7; }
        
        .media-input-hidden { display: none; }
      `}</style>
    </main>
  );
}
