import { Suspense, lazy, useEffect, useEffectEvent, useRef } from 'react';
import toast from 'react-hot-toast';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const GrowthPage = lazy(() => import('./pages/GrowthPage'));
const LeafAnalysisPage = lazy(() => import('./pages/LeafAnalysisPage'));
const InsectPage = lazy(() => import('./pages/InsectPage'));
const LightMeterPage = lazy(() => import('./pages/LightMeterPage'));
const PlantDoctorPage = lazy(() => import('./pages/PlantDoctorPage'));
const MediaPage = lazy(() => import('./pages/MediaPage'));
const ArthropodDetectionPage = lazy(() => import('./pages/ArthropodDetectionPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const PlantManagementPage = lazy(() => import('./pages/PlantManagementPage'));
const PlantDetailPage = lazy(() => import('./pages/PlantDetailPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const ControlCenterPage = lazy(() => import('./pages/ControlCenterPage'));
const KBAPage = lazy(() => import('./pages/KBAPage'));
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage'));
const OfficePackBuilder3D = lazy(() => import('./pages/OfficePackBuilder3D'));
const ShowcasePage = lazy(() => import('./pages/ShowcasePage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));

const LAST_READING_NOTIFICATION_KEY = 'smart-plant:last-reading-notification';

function readSessionStorage(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key, value) {
  try {
    if (!value) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(key, value);
  } catch {
    // no-op when storage is unavailable
  }
}

function showLiveAlertToast({ plant, topAlert, topRecommendation }) {
  toast.custom(
    (toastInstance) => (
      <div className={`live-alert-toast ${toastInstance.visible ? 'live-alert-toast--enter' : 'live-alert-toast--exit'}`}>
        <div className="live-alert-toast__eyebrow">Live plant alert</div>
        <strong>{topAlert?.title || topRecommendation?.title || 'New plant update'}</strong>
        {plant?.name ? <div className="live-alert-toast__plant">Plant: {plant.name}</div> : null}
        <p>{topAlert?.description || topRecommendation?.explanation || 'A new plant event needs your attention.'}</p>
        {topRecommendation?.suggestedAction ? (
          <div className="live-alert-toast__action">Do this: {topRecommendation.suggestedAction}</div>
        ) : null}
      </div>
    ),
    {
      duration: 5000,
      id: `live-alert-${topAlert?.id || topRecommendation?.id || Date.now()}`
    }
  );
}

const navigationGroups = [
  {
    label: 'Core',
    items: [
      {
        to: '/',
        label: 'Dashboard',
        description: 'Live plant status, tasks, and top recommendation'
      },
      {
        to: '/onboarding',
        label: 'Onboarding',
        description: 'Experience level, environment, and reminders'
      },
      {
        to: '/plants',
        label: 'Plants',
        description: 'Manage plant profiles and assigned devices'
      },
      {
        to: '/plant-detail',
        label: 'Plant Detail',
        description: 'Drill into one plant with metrics, alerts, and history'
      }
    ]
  },
  {
    label: 'Care',
    items: [
      {
        to: '/analytics',
        label: 'Analytics',
        description: 'Historical sensor graphs and thresholds'
      },
      {
        to: '/alerts',
        label: 'Alerts',
        description: 'Warnings, severity levels, and actions'
      },
      {
        to: '/recommendations',
        label: 'Recommendations',
        description: 'Rule-based advice with explanations'
      },
      {
        to: '/controls',
        label: 'Controls',
        description: 'Manual actuator control with command log'
      },
      {
        to: '/automation',
        label: 'Automation',
        description: 'Expert system rules and smart triggers'
      },
    ]
  },
  {
    label: 'Support',
    items: [
      {
        to: '/kba',
        label: 'Knowledge Base',
        description: 'Guides, explanations, and troubleshooting help'
      },
      {
        to: '/diagnostics',
        label: 'Diagnostics',
        description: 'Device status, recent commands, and last sync'
      }
    ]
  },
  {
    label: 'AI Tools',
    items: [
      {
        to: '/growth',
        label: 'Growth Diary',
        description: 'Daily USB camera captures saved in app folders'
      },
      {
        to: '/leaf-analysis',
        label: 'Leaf Analysis',
        description: 'Damage type classification from photos'
      },
      {
        to: '/insect',
        label: 'Insect Audio',
        description: 'Bioacoustic insect identification'
      },
      {
        to: '/light',
        label: 'Light Meter',
        description: 'Spectral light suitability analysis'
      },
      {
        to: '/doctor',
        label: 'Plant Doctor',
        description: 'Plant-care chatbot with image context'
      },
      {
        to: '/media',
        label: 'Media Split',
        description: 'Split saved insect videos into video and audio tracks'
      },
      {
        to: '/arthropod',
        label: 'Arthropod Detector',
        description: 'YOLO computer vision pest detection'
      },
      {
        to: '/office-pack-3d',
        label: 'Office Pack 3D',
        description: 'Builder page using only Office pack GLB files'
      },
      {
        to: '/showcase',
        label: 'Predictive Care',
        description: 'Predictive Plant Care Using Time-Series Regression'
      }
    ]
  }
];

function App() {
  const navRef = useRef(null);
  const lastReadingNotificationRef = useRef(readSessionStorage(LAST_READING_NOTIFICATION_KEY));

  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement) {
      return undefined;
    }

    const updateNavHeight = () => {
      document.documentElement.style.setProperty('--workspace-nav-height', `${navElement.offsetHeight}px`);
    };

    updateNavHeight();

    const resizeObserver = new ResizeObserver(updateNavHeight);
    resizeObserver.observe(navElement);
    window.addEventListener('resize', updateNavHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateNavHeight);
      document.documentElement.style.removeProperty('--workspace-nav-height');
    };
  }, []);

  const pollLiveNotifications = useEffectEvent(async () => {
    try {
      const payload = await api.getLiveNotifications();
      const notificationKey = payload?.notificationKey || null;
      const topAlert = payload?.topAlert || null;
      const topRecommendation = payload?.topRecommendation || null;

      if (!notificationKey) {
        return;
      }

      if (lastReadingNotificationRef.current === notificationKey) {
        return;
      }

      lastReadingNotificationRef.current = notificationKey;
      writeSessionStorage(LAST_READING_NOTIFICATION_KEY, notificationKey);

      if (!topAlert && !topRecommendation) {
        return;
      }

      showLiveAlertToast({
        plant: payload?.plant || null,
        topAlert,
        topRecommendation
      });
    } catch {
      // Ignore polling errors here to avoid noisy UI when backend is restarting.
    }
  });

  useEffect(() => {
    pollLiveNotifications();

    const intervalId = setInterval(() => {
      pollLiveNotifications();
    }, 12000);

    return () => {
      clearInterval(intervalId);
    };
  }, [pollLiveNotifications]);

  return (
    <>
      <header className="workspace-nav" ref={navRef}>
        <div className="workspace-nav__inner">
          <div className="workspace-nav__copy">
            <span className="hero-panel__eyebrow">Smart Plant Monitoring Console</span>
            <strong>Single-user care dashboard, automation, diagnostics, and AI tools in one fixed workspace.</strong>
          </div>

          <nav className="workspace-tab-groups" aria-label="Primary views">
            {navigationGroups.map((group) => (
              <div key={group.label} className="workspace-tab-group">
                <span className="workspace-tab-group__label">{group.label}</span>
                <div className="workspace-tabs">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={item.description}
                      end={item.to === '/'}
                      className={({ isActive }) => `workspace-tab ${isActive ? 'workspace-tab--active' : ''}`}
                    >
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </header>

      <div className="workspace-main">
        <Suspense fallback={<main className="app-shell"><div className="loading-banner">Loading view...</div></main>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/plants" element={<PlantManagementPage />} />
            <Route path="/plant-detail" element={<PlantDetailPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/recommendations" element={<RecommendationsPage />} />
            <Route path="/controls" element={<ControlCenterPage />} />
            <Route path="/kba" element={<KBAPage />} />
            <Route path="/kba/:slug" element={<KBAPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/growth" element={<GrowthPage />} />
            <Route path="/leaf-analysis" element={<LeafAnalysisPage />} />
            <Route path="/insect" element={<InsectPage />} />
            <Route path="/light" element={<LightMeterPage />} />
            <Route path="/doctor" element={<PlantDoctorPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/arthropod" element={<ArthropodDetectionPage />} />
            <Route path="/office-pack-3d" element={<OfficePackBuilder3D />} />
            <Route path="/showcase" element={<ShowcasePage />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

export default App;
