import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import '../styles/HouseBuilder3D.css';

const ROOM_H = 240;

// Non-rectangular room: right angles at front corners, left depth=353, right depth=323
// Centred so z≈0 is the room mid-depth (shift by -169, the z-centroid)
const Z_OFF = 169;
const C_FL  = [-239,  0,  -Z_OFF];          // front-left
const C_FR  = [ 239,  0,  -Z_OFF];          // front-right
const C_BR  = [ 239,  0,  323 - Z_OFF];     // back-right  (right wall = 323)
const C_BL  = [-239,  0,  353 - Z_OFF];     // back-left   (left  wall = 353)

// Walls: front=478, right=323, back≈479 (diagonal), left=353
const WALLS = [
  { key: 'front', from: C_FL, to: C_FR, userLength: 478 },
  { key: 'right', from: C_FR, to: C_BR, userLength: 323 },
  { key: 'back',  from: C_BR, to: C_BL, userLength: 478 },
  { key: 'left',  from: C_BL, to: C_FL, userLength: 353 },
];

function wallGeom(from, to) {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const L  = Math.sqrt(dx * dx + dz * dz);
  return { L, cx: (from[0] + to[0]) / 2, cz: (from[2] + to[2]) / 2, angle: Math.atan2(-dz, dx) };
}

const CATALOG = [
  { id: 'radio', name: 'Radio tower', icon: 'A', kind: 'beacon' },
  { id: 'table-lamp', name: 'Table Lamp', icon: 'L', kind: 'beacon' },
  { id: 'bedside-lamp', name: 'Bedside Lamp', icon: 'L', kind: 'beacon' },
  { id: 'desk-lamp', name: 'Desk Lamp', icon: 'L', kind: 'beacon' },
  { id: 'chair', name: 'Chair', icon: 'C', kind: 'basic' },
  { id: 'table', name: 'Table', icon: 'T', kind: 'basic' },
  { id: 'plant', name: 'Plant', icon: 'P', kind: 'basic' }
];

function getDefaultSize(typeId) {
  if (typeId === 'radio') return 130;
  if (typeId.includes('lamp')) return 80;
  if (typeId === 'table') return 140;
  if (typeId === 'chair') return 70;
  return 90;
}

function Room() {
  // ShapeGeometry is in XY plane; after rotation=[-π/2,0,0]: shape(sx,sy)→world(sx,0,-sy)
  // So encode corners as (worldX, -worldZ) inside the shape
  const floor = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(C_FL[0], -C_FL[2]);
    s.lineTo(C_FR[0], -C_FR[2]);
    s.lineTo(C_BR[0], -C_BR[2]);
    s.lineTo(C_BL[0], -C_BL[2]);
    s.closePath();
    return s;
  }, []);

  return (
    <group>
      {/* Trapezoidal floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[floor]} />
        <meshStandardMaterial color="#c9bea7" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* 4 walls, each correctly positioned and rotated for its actual direction */}
      {WALLS.map(({ key, from, to }) => {
        const { L, cx, cz, angle } = wallGeom(from, to);
        return (
          <mesh key={key} position={[cx, ROOM_H / 2, cz]} rotation={[0, angle, 0]} castShadow>
            <boxGeometry args={[L + 12, ROOM_H, 12]} />
            <meshStandardMaterial color="#bcb4a4" />
          </mesh>
        );
      })}
    </group>
  );
}

/* ── Rulers at the top edge of every wall ────────────────────── */
/* ── Rulers at the top edge of each wall (follows actual wall geometry) ── */
function Rulers() {
  const TICK_STEP = 100;
  return (
    <group>
      {WALLS.map(({ key, from, to, userLength }) => {
        const { L, cx, cz, angle } = wallGeom(from, to);
        // Ticks in local wall space — local-X runs along the wall length
        const ticks = [];
        for (let d = 0; d <= userLength; d += TICK_STEP) {
          const localX = (d / userLength) * L - L / 2;
          ticks.push(
            <group key={d} position={[localX, 0, 0]}>
              <mesh position={[0, 28, 0]}>
                <boxGeometry args={[4, 56, 4]} />
                <meshBasicMaterial color="#3d7abf" />
              </mesh>
              <Html center position={[0, 62, 10]} style={{ pointerEvents: 'none' }}>
                <span style={{
                  color: '#5599dd', fontSize: 9, fontFamily: 'monospace',
                  pointerEvents: 'none', userSelect: 'none',
                  textShadow: '0 1px 3px #000', whiteSpace: 'nowrap',
                }}>{d}</span>
              </Html>
            </group>
          );
        }
        return (
          <group key={key} position={[cx, ROOM_H, cz]} rotation={[0, angle, 0]}>
            {/* ruler baseline bar */}
            <mesh>
              <boxGeometry args={[L + 16, 8, 14]} />
              <meshBasicMaterial color="#12122a" />
            </mesh>
            {/* wall length badge */}
            <Html center position={[0, 50, 12]} style={{ pointerEvents: 'none' }}>
              <span style={{
                color: '#4488cc', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                pointerEvents: 'none', userSelect: 'none', textShadow: '0 1px 4px #000',
              }}>{userLength} cm</span>
            </Html>
            {ticks}
          </group>
        );
      })}
    </group>
  );
}

function BeaconPrimitive({ typeId, size }) {
  if (typeId === 'radio') {
    return (
      <group>
        <mesh position={[0, size * 0.35, 0]} castShadow>
          <cylinderGeometry args={[size * 0.06, size * 0.09, size * 0.7, 14]} />
          <meshStandardMaterial color="#727a84" metalness={0.45} roughness={0.45} />
        </mesh>
        <mesh position={[0, size * 0.76, 0]} castShadow>
          <sphereGeometry args={[size * 0.09, 18, 18]} />
          <meshStandardMaterial color="#19d492" emissive="#19d492" emissiveIntensity={0.45} />
        </mesh>
      </group>
    );
  }

  const stem = typeId === 'desk-lamp' ? size * 0.42 : size * 0.52;
  return (
    <group>
      <mesh position={[0, size * 0.03, 0]} castShadow>
        <cylinderGeometry args={[size * 0.2, size * 0.2, size * 0.06, 16]} />
        <meshStandardMaterial color="#646a73" roughness={0.65} />
      </mesh>
      <mesh position={[0, size * 0.06 + stem * 0.5, 0]} castShadow>
        <cylinderGeometry args={[size * 0.028, size * 0.028, stem, 10]} />
        <meshStandardMaterial color="#8f969f" metalness={0.4} roughness={0.38} />
      </mesh>
      <mesh position={[0, size * 0.06 + stem + size * 0.12, 0]} castShadow>
        <cylinderGeometry args={[size * 0.12, size * 0.2, size * 0.24, 16]} />
        <meshStandardMaterial color="#f3f5f8" emissive="#74d6ff" emissiveIntensity={0.18} />
      </mesh>
    </group>
  );
}

function BasicPrimitive({ typeId, size }) {
  if (typeId === 'table') {
    return (
      <group>
        <mesh position={[0, size * 0.55, 0]} castShadow>
          <boxGeometry args={[size * 1.1, size * 0.1, size * 0.7]} />
          <meshStandardMaterial color="#8b6b4b" />
        </mesh>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <mesh key={`${x}_${z}`} position={[x * size * 0.45, size * 0.26, z * size * 0.26]} castShadow>
              <boxGeometry args={[size * 0.08, size * 0.52, size * 0.08]} />
              <meshStandardMaterial color="#7a5d41" />
            </mesh>
          ))
        )}
      </group>
    );
  }

  if (typeId === 'chair') {
    return (
      <group>
        <mesh position={[0, size * 0.28, 0]} castShadow>
          <boxGeometry args={[size * 0.55, size * 0.08, size * 0.55]} />
          <meshStandardMaterial color="#5e8ab3" />
        </mesh>
        <mesh position={[0, size * 0.54, -size * 0.24]} castShadow>
          <boxGeometry args={[size * 0.55, size * 0.5, size * 0.08]} />
          <meshStandardMaterial color="#537ca3" />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, size * 0.15, 0]} castShadow>
        <cylinderGeometry args={[size * 0.17, size * 0.2, size * 0.3, 16]} />
        <meshStandardMaterial color="#d8d8d8" />
      </mesh>
      <mesh position={[0, size * 0.55, 0]} castShadow>
        <sphereGeometry args={[size * 0.22, 16, 16]} />
        <meshStandardMaterial color="#3dbf6f" />
      </mesh>
    </group>
  );
}

function ObjectNode({ obj, isSelected, onSelect, showCoverage }) {
  const size = getDefaultSize(obj.typeId);
  const isBeacon = obj.kind === 'beacon';

  return (
    <group
      position={[obj.position[0], obj.position[1], obj.position[2]]}
      rotation={[0, obj.rotationY, 0]}
      scale={[obj.scale, obj.scale, obj.scale]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(obj.id);
      }}
    >
      {isBeacon ? <BeaconPrimitive typeId={obj.typeId} size={size} /> : <BasicPrimitive typeId={obj.typeId} size={size} />}

      {isBeacon && showCoverage ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
          <ringGeometry args={[obj.coverage - 4, obj.coverage, 64]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={0.16} />
        </mesh>
      ) : null}

      <mesh position={[0, size * 0.35, 0]}>
        <boxGeometry args={[size * 0.9, size * 0.9, size * 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Html position={[0, size * 0.82, 0]} center style={{ pointerEvents: 'none' }}>
        <span
          style={{
            background: isSelected ? 'rgba(0,212,255,0.9)' : 'rgba(0,0,0,0.65)',
            color: '#fff',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 7px',
            whiteSpace: 'nowrap'
          }}
        >
          {obj.label}
        </span>
      </Html>
    </group>
  );
}

function createObject(typeId) {
  const catalogItem = CATALOG.find((item) => item.id === typeId);
  const base = Date.now() + Math.random();
  return {
    id: base,
    typeId,
    kind: catalogItem?.kind || 'basic',
    label: catalogItem?.name || typeId,
    position: [0, 0, 0],
    rotationY: 0,
    scale: 1,
    coverage: 150
  };
}

export default function HouseBuilder3DClean() {
  const [objects, setObjects] = useState(() => {
    try {
      const raw = localStorage.getItem('hb3d_clean_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.objects) ? parsed.objects : [];
    } catch {
      return [];
    }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [showCoverage, setShowCoverage] = useState(true);

  const selected = useMemo(() => objects.find((obj) => obj.id === selectedId) || null, [objects, selectedId]);

  const persist = (next) => {
    setObjects(next);
    localStorage.setItem('hb3d_clean_v1', JSON.stringify({ objects: next, ts: new Date().toISOString() }));
  };

  const addObject = (typeId) => {
    const next = [...objects, createObject(typeId)];
    persist(next);
    setSelectedId(next[next.length - 1].id);
  };

  const updateSelected = (patch) => {
    if (!selected) return;
    const next = objects.map((obj) => (obj.id === selected.id ? { ...obj, ...patch } : obj));
    persist(next);
  };

  const deleteSelected = () => {
    if (!selected) return;
    const next = objects.filter((obj) => obj.id !== selected.id);
    persist(next);
    setSelectedId(null);
  };

  return (
    <div className="hb-root">
      <header className="hb-hdr">
        <div className="hb-title">
          <span style={{ fontSize: '1.7rem' }}>H</span>
          <div>
            <h1>3D Workspace Map (Clean)</h1>
            <p>Isolated version. No beacon GLB files. Organized and stable behavior.</p>
          </div>
        </div>
        <div className="hb-tb">
          <div className="hb-grp">
            <span className="hb-gl">Tools</span>
            <button className={`hb-btn ${showCoverage ? 'act' : ''}`} onClick={() => setShowCoverage((v) => !v)}>
              Coverage
            </button>
            <button
              className="hb-btn hb-danger"
              onClick={() => {
                persist([]);
                setSelectedId(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      <div className="hb-main">
        <aside className="hb-sb open">
          <div className="hb-sb-hdr">
            <h2>Objects</h2>
          </div>
          <div className="hb-sb-cats" style={{ paddingTop: 8 }}>
            {CATALOG.map((item) => (
              <button key={item.id} className={`hb-item ${item.kind === 'beacon' ? 'is-ant' : ''}`} onClick={() => addObject(item.id)}>
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="hb-ca">
          <div className="hb-info">
            <span>Clean path: stable primitives for beacons and core objects.</span>
            <span>Objects: {objects.length}</span>
          </div>

          <div className="hb-cw">
            <Canvas camera={{ position: [360, 320, 420], fov: 52 }} shadows onPointerMissed={() => setSelectedId(null)}>
              <color attach="background" args={['#0e0e20']} />
              <ambientLight intensity={0.68} />
              <directionalLight castShadow position={[220, 420, 180]} intensity={1.25} />
              <gridHelper args={[2000, 80, '#1e1e40', '#181830']} position={[0, 0, 0]} />
              <Room />
              <Rulers />
              {objects.map((obj) => (
                <ObjectNode
                  key={obj.id}
                  obj={obj}
                  isSelected={obj.id === selectedId}
                  onSelect={setSelectedId}
                  showCoverage={showCoverage}
                />
              ))}
              <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0, 40, 0]} minDistance={70} maxDistance={1800} />
            </Canvas>
          </div>
        </div>

        {selected ? (
          <aside className="hb-props">
            <div className="hb-ph">
              <span>{selected.label}</span>
              <button className="hb-ib hb-del" onClick={deleteSelected}>x</button>
            </div>

            <div className="hb-ps">
              <label>Position X / Z</label>
              <div className="hb-xyz">
                <div className="hb-xf">
                  <span className="hb-ax hb-axx">X</span>
                  <input
                    type="number"
                    step="5"
                    value={selected.position[0]}
                    onChange={(event) => {
                      const x = Number(event.target.value) || 0;
                      updateSelected({ position: [Math.max(-225, Math.min(225, x)), 0, selected.position[2]] });
                    }}
                  />
                </div>
                <div className="hb-xf">
                  <span className="hb-ax hb-axz">Z</span>
                  <input
                    type="number"
                    step="5"
                    value={selected.position[2]}
                    onChange={(event) => {
                      const z = Number(event.target.value) || 0;
                      updateSelected({ position: [selected.position[0], 0, Math.max(-155, Math.min(175, z))] });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="hb-ps">
              <label>Rotate Y</label>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={Math.round((selected.rotationY * 180) / Math.PI)}
                onChange={(event) => {
                  const deg = Number(event.target.value) || 0;
                  updateSelected({ rotationY: (deg * Math.PI) / 180 });
                }}
              />
            </div>

            <div className="hb-ps">
              <label>Scale</label>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={selected.scale}
                onChange={(event) => {
                  updateSelected({ scale: Number(event.target.value) || 1 });
                }}
              />
            </div>

            {selected.kind === 'beacon' ? (
              <div className="hb-ps hb-ant">
                <label>Coverage</label>
                <input
                  type="number"
                  min={50}
                  max={500}
                  step={10}
                  value={selected.coverage}
                  onChange={(event) => {
                    const next = Number(event.target.value) || 150;
                    updateSelected({ coverage: Math.max(50, Math.min(500, next)) });
                  }}
                />
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
