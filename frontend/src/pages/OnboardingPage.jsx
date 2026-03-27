import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const STEPS = ['Welcome', 'Experience', 'Environment', 'Notifications', 'Done'];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    experienceLevel: 'beginner',
    environmentType: 'indoor',
    notificationPreference: 'urgent_only'
  });

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await api.completeOnboarding(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }
  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <main className="app-shell">
      <div className="page-container onboarding-container">
        {/* Progress bar */}
        <div className="onboarding-progress">
          <div className="onboarding-progress__bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="onboarding-step-label">{STEPS[step]} ({step + 1} of {STEPS.length})</p>

        {step === 0 && (
          <div className="onboarding-card">
            <div className="onboarding-icon">🌿</div>
            <h1 className="onboarding-title">Welcome to Smart Plant</h1>
            <p className="onboarding-body">
              Let's take two minutes to personalise your experience. You can change these settings any time from your profile.
            </p>
            <button className="btn btn--primary btn--lg" onClick={next}>Get started</button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-card">
            <h2 className="onboarding-title">Your experience level</h2>
            <p className="onboarding-body">This adjusts how much guidance and help text we show you.</p>
            <div className="option-group">
              {[
                { value: 'beginner', label: 'Beginner', desc: 'New to plant care — show me all the tips' },
                { value: 'intermediate', label: 'Intermediate', desc: 'Some experience — show me the important details' },
                { value: 'expert', label: 'Expert', desc: 'Experienced grower — minimal hand-holding' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`option-card ${form.experienceLevel === opt.value ? 'option-card--selected' : ''}`}
                  onClick={() => set('experienceLevel', opt.value)}
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="btn btn--ghost" onClick={back}>Back</button>
              <button className="btn btn--primary" onClick={next}>Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-card">
            <h2 className="onboarding-title">Your environment</h2>
            <p className="onboarding-body">This helps the system give context-appropriate recommendations.</p>
            <div className="option-group">
              {[
                { value: 'indoor', label: 'Indoor', desc: 'Inside your home or office' },
                { value: 'outdoor', label: 'Outdoor', desc: 'Outside garden or balcony' },
                { value: 'greenhouse', label: 'Greenhouse / Controlled', desc: 'Climate-controlled growing space' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`option-card ${form.environmentType === opt.value ? 'option-card--selected' : ''}`}
                  onClick={() => set('environmentType', opt.value)}
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="btn btn--ghost" onClick={back}>Back</button>
              <button className="btn btn--primary" onClick={next}>Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-card">
            <h2 className="onboarding-title">Notification style</h2>
            <p className="onboarding-body">How often should the system surface alerts and reminders?</p>
            <div className="option-group">
              {[
                { value: 'morning', label: 'Morning summary', desc: 'Digest of overnight activity each morning' },
                { value: 'evening', label: 'Evening summary', desc: 'Daily recap in the evening' },
                { value: 'urgent_only', label: 'Urgent alerts only', desc: 'Only critical issues — keep it quiet' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`option-card ${form.notificationPreference === opt.value ? 'option-card--selected' : ''}`}
                  onClick={() => set('notificationPreference', opt.value)}
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </button>
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="onboarding-actions">
              <button className="btn btn--ghost" onClick={back}>Back</button>
              <button className="btn btn--primary" onClick={next}>Review</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-card">
            <div className="onboarding-icon">✅</div>
            <h2 className="onboarding-title">You're all set</h2>
            <div className="review-summary">
              <div className="review-row"><span>Experience:</span><strong>{form.experienceLevel}</strong></div>
              <div className="review-row"><span>Environment:</span><strong>{form.environmentType}</strong></div>
              <div className="review-row"><span>Notifications:</span><strong>{form.notificationPreference.replace('_', ' ')}</strong></div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="onboarding-actions">
              <button className="btn btn--ghost" onClick={back}>Back</button>
              <button className="btn btn--primary btn--lg" onClick={finish} disabled={saving}>
                {saving ? 'Saving…' : 'Take me to the dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
