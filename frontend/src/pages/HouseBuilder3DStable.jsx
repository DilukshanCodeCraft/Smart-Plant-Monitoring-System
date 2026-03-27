import React, {
  useState, useRef, useCallback, useMemo, Suspense, useEffect, createContext, useContext
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html, GizmoHelper, GizmoViewport, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import '../styles/HouseBuilder3D.css';

// ═══════════════════════════════════════════
//  ROOM  –  trapezoid, measurements in cm
//  Walls going clockwise: N=478, E=353, W=323
//  Corners centred at origin (X=right, Z=forward, Y=up):
//    NW (-239,  0, -169) ── NE (239,  0, -169)   [North wall 478cm]
//    │  West 323cm          │  East 353cm
//    SW (-239,  0,  154) ── SE (239,  0,  184)
// ═══════════════════════════════════════════
const NW = new THREE.Vector3(-239, 0, -169);
const NE = new THREE.Vector3( 239, 0, -169);
const SE = new THREE.Vector3( 239, 0,  184);
const SW = new THREE.Vector3(-239, 0,  154);

const WALL_H = 250;   // cm – realistic room height
const WALL_T = 18;    // cm – wall thickness
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ═══════════════════════════════════════════
//  MODEL SIZES (target max-dimension, cm)
// ═══════════════════════════════════════════
const MODEL_SIZE = {
  'Radio tower':150, Chair:65, 'Adjustable Desk':130, Desk:130,
  'Couch Medium':170, 'Couch Small':130, Cabinet:110, 'Coffee Table':90,
  'Double Bed':200, 'Single Bed':150, 'Executive Desk':160, 'Executive Chair':70,
  'Three Seater Couch':210, 'Two Seater Couch':160, 'Club Arm Chair':80,
  'Wooden Chair':65, 'Ottoman Coffe Table':90, 'Rounded Coffee Table':80,
  'Ceiling Light':70, 'Ceiling Fan':110, 'Floor Lamp':160, 'Table Lamp':60,
  'Desk Lamp':55, 'Bedside Lamp':55,
  Computer:60, 'Computer Screen':60, Monitor:60, 'CCTV Camera':25, Tv:130,
  Fridge:180, 'Gas Stove':80, 'Dish Washer':90, 'Coffee Machine':50,
  Blender:40, 'Modern Kitchen Table':130, 'Wood Kitchen Chair':65,
  'File Cabinet':110, 'Large Wardrobe':200, 'Large Book Shelf':180,
  'Cube Cabinet':90, 'Floating Shelf':80,
  'Blank Picture Frame':60, 'Analog clock':40, 'Curtains Double':180,
  Fireplace:130, 'Wool Carpet':240, Mirror:120,
  Doorway:230, 'Doorway Front':230,
  Houseplant: 80, 'Houseplant 2': 100, 'Houseplant 3': 120, 'Houseplant 4': 90,
  'Plant White Pot': 60, 'Potted Plant': 70,
};

// ═══════════════════════════════════════════
//  CATALOG
// ═══════════════════════════════════════════
const CATALOG = {
  'Beacons': [
    { name:'Radio tower',   icon:'📡', desc:'WiFi ESP32 Beacon', isAntenna:true, beaconVariant:'radio' },
    { name:'Table Lamp',    icon:'💡', desc:'ESP32 Beacon A/B/C', isAntenna:true, beaconVariant:'table' },
    { name:'Bedside Lamp',  icon:'💡', desc:'ESP32 Beacon A/B/C', isAntenna:true, beaconVariant:'bedside' },
    { name:'Desk Lamp',     icon:'🔆', desc:'ESP32 Beacon A/B/C', isAntenna:true, beaconVariant:'desk' },
  ],
  'Furniture': [
    { name:'Chair',             file:'office/Chair.glb',                   icon:'🪑' },
    { name:'Adjustable Desk',   file:'office/Adjustable Desk.glb',         icon:'📋' },
    { name:'Desk',              file:'office/Desk.glb',                    icon:'📋' },
    { name:'Couch Medium',      file:'office/Couch Medium.glb',            icon:'🛋️' },
    { name:'Couch Small',       file:'office/Couch Small.glb',             icon:'🛋️' },
    { name:'Cabinet',           file:'office/Cabinet.glb',                 icon:'🗄️' },
    { name:'Coffee Table',      file:'office/Coffee Table.glb',            icon:'☕' },
    { name:'Double Bed',        file:'interior/Double Bed.glb',            icon:'🛏️' },
    { name:'Single Bed',        file:'interior/Single Bed.glb',            icon:'🛏️' },
    { name:'Executive Desk',    file:'interior/Executive Desk.glb',        icon:'📋' },
    { name:'Executive Chair',   file:'interior/Executive Chair.glb',       icon:'🪑' },
    { name:'Three Seater Couch',file:'interior/Three Seater Couch.glb',    icon:'🛋️' },
    { name:'Two Seater Couch',  file:'interior/Two Seater Couch.glb',      icon:'🛋️' },
    { name:'Club Arm Chair',    file:'interior/Club Arm Chair.glb',        icon:'🪑' },
    { name:'Wooden Chair',      file:'interior/Wooden Chair.glb',          icon:'🪑' },
    { name:'Ottoman Coffe Table',file:'interior/Ottoman Coffe Table.glb',  icon:'☕' },
    { name:'Rounded Coffee Table',file:'interior/Rounded Coffee Table.glb',icon:'☕' },
  ],
  'Lighting': [
    { name:'Ceiling Light', file:'office/Ceiling Light.glb',   icon:'💡' },
    { name:'Ceiling Fan',   file:'office/Ceiling Fan.glb',     icon:'🌀' },
    { name:'Floor Lamp',    file:'interior/Floor Lamp.glb',   icon:'🔦' },
  ],
  'Tech': [
    { name:'Computer',        file:'office/Computer.glb',        icon:'💻' },
    { name:'Computer Screen', file:'office/Computer Screen.glb', icon:'🖥️' },
    { name:'Monitor',         file:'interior/Monitor.glb',       icon:'🖥️' },
    { name:'CCTV Camera',     file:'office/CCTV Camera.glb',     icon:'📹' },
    { name:'Tv',              file:'interior/Tv.glb',            icon:'📺' },
  ],
  'Kitchen': [
    { name:'Fridge',               file:'interior/Fridge.glb',               icon:'🧊' },
    { name:'Gas Stove',            file:'interior/Gas Stove.glb',            icon:'🔥' },
    { name:'Dish Washer',          file:'interior/Dish Washer.glb',          icon:'🫧' },
    { name:'Coffee Machine',       file:'interior/Coffee Machine.glb',       icon:'☕' },
    { name:'Blender',              file:'interior/Blender.glb',              icon:'🥤' },
    { name:'Modern Kitchen Table', file:'interior/Modern Kitchen Table.glb', icon:'🍽️' },
    { name:'Wood Kitchen Chair',   file:'interior/Wood Kitchen Chair.glb',   icon:'🪑' },
  ],
  'Storage': [
    { name:'File Cabinet',   file:'office/File Cabinet.glb',         icon:'🗂️' },
    { name:'Large Wardrobe', file:'interior/Large Wardrobe.glb',     icon:'👗' },
    { name:'Large Book Shelf',file:'interior/Large Book Shelf.glb',  icon:'📚' },
    { name:'Cube Cabinet',   file:'interior/Cube Cabinet.glb',       icon:'📦' },
    { name:'Floating Shelf', file:'interior/Floating Shelf.glb',     icon:'📚' },
  ],
  'Décor': [
    { name:'Blank Picture Frame', file:'office/Blank Picture Frame.glb', icon:'🖼️' },
    { name:'Analog clock',        file:'office/Analog clock.glb',        icon:'🕐' },
    { name:'Curtains Double',     file:'office/Curtains Double.glb',     icon:'🪟' },
    { name:'Fireplace',           file:'interior/Fireplace.glb',         icon:'🔥' },
    { name:'Wool Carpet',         file:'interior/Wool Carpet.glb',       icon:'🟫' },
    { name:'Mirror',              file:'interior/Mirror.glb',            icon:'🪞' },
  ],
  'Plants': [
    { name:'Houseplant',       file:'office/Houseplant.glb',               icon:'🪴' },
    { name:'Houseplant 2',     file:'office/Houseplant-VtJh4Irl4w.glb',    icon:'🪴' },
    { name:'Houseplant 3',     file:'office/Houseplant-bfLOqIV5uP.glb',    icon:'🪴' },
    { name:'Houseplant 4',     file:'office/Houseplant-e9oRt-Ct6js.glb',   icon:'🪴' },
    { name:'Plant White Pot',  file:'office/Plant - White Pot.glb',        icon:'🪴' },
    { name:'Potted Plant',     file:'office/Potted Plant.glb',             icon:'🪴' },
  ],
  'Doors': [
    { name:'Doorway',       file:'office/Doorway.glb',       icon:'🚪' },
    { name:'Doorway Front', file:'office/Doorway Front.glb', icon:'🚪' },
  ],
};

const ALL = Object.entries(CATALOG).flatMap(([cat, items]) => items.map(m => ({ ...m, cat })));
const getM = name => ALL.find(m => m.name === name);

const asFinite = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const clampNum = (v, min, max, fb = 0) => {
  const n = asFinite(v, fb);
  return Math.min(max, Math.max(min, n));
};

const sanitizeVec3 = (arr, fb = [0, 0, 0]) => {
  const a = Array.isArray(arr) ? arr : fb;
  return [
    clampNum(a[0], -3000, 3000, fb[0]),
    clampNum(a[1], -3000, 3000, fb[1]),
    clampNum(a[2], -3000, 3000, fb[2]),
  ];
};

const sanitizeObject = (o) => {
  if (!o || !getM(o.model)) return null;

  const p = sanitizeVec3(o.position, [0, 0, 0]);
  const r = sanitizeVec3(o.rotation, [0, 0, 0]);
  const s = clampNum(Array.isArray(o.scale) ? o.scale[0] : o.scale, 0.1, 4, 1);

  return {
    id: o.id ?? (Date.now() + Math.random()),
    model: o.model,
    position: [
      clampNum(p[0], -220, 220, 0),
      clampNum(p[1], -50, 400, 0),
      clampNum(p[2], -170, 185, 0),
    ],
    rotation: r,
    scale: [s, s, s],
    label: typeof o.label === 'string' ? o.label.slice(0, 60) : '',
    locked: !!o.locked,
    coverage: clampNum(o.coverage, 50, 500, 150),
  };
};

const sanitizeObjects = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeObject).filter(Boolean);
};

// ═══════════════════════════════════════════
//  CONTEXT
// ═══════════════════════════════════════════
const Ctx = createContext(null);

// ═══════════════════════════════════════════
//  ERROR BOUNDARY
// ═══════════════════════════════════════════
class ErrBound extends React.Component {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (this.state.err) return <FallBox size={50} />;
    return this.props.children;
  }
}

function FallBox({ size = 50, color = '#6c63ff' }) {
  return (
    <mesh position={[0, size / 2, 0]}>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
}

// ═══════════════════════════════════════════
//  AUTO-SIZED GLB
//  Scale to targetSize cm (max dimension)
//  Lift so bottom sits at Y=0
// ═══════════════════════════════════════════
function AutoGLB({ file, targetSize }) {
  const { scene } = useGLTF(`/models/${file}`);
  const [tx, setTx] = useState({ s: 1, y: 0 });

  useEffect(() => {
    try {
      const box = new THREE.Box3().setFromObject(scene);
      if (!box.isEmpty()) {
        const sz = box.getSize(new THREE.Vector3());
        const maxD = Math.max(sz.x, sz.y, sz.z);
        if (maxD > 0 && isFinite(maxD)) {
          // Some FBX-derived GLBs come in very small units (e.g. 0.001..0.01).
          // Use a high upper bound so tiny beacon models are still visible.
          const s = Math.min(Math.max(targetSize / maxD, 0.001), 50000);
          const scaledMinY = box.min.y * s;
          setTx({ s, y: -scaledMinY });
        }
      }
    } catch (e) {
      console.warn("AutoGLB bounds error:", e);
    }
  }, [scene, targetSize]);

  // Clone using primitive so instances don't share identical transform spaces incorrectly
  const glb = useMemo(() => {
    const c = scene.clone(true);
    let hasRenderableMesh = false;

    c.traverse(child => {
      // Keep GLB node hierarchy intact, but neutralize imported light influence.
      if (child.isLight) {
        child.intensity = 0;
        child.castShadow = false;
      }

      if (child.isMesh || child.isSkinnedMesh) {
        hasRenderableMesh = true;
      }

      // Disable raycasting on deep GLTF nodes to avoid intercepting or crashing raycaster
      child.raycast = () => null;
    });

    return { scene: c, hasRenderableMesh };
  }, [scene]);

  return (
    <group scale={tx.s} position={[0, tx.y, 0]}>
      <primitive object={glb.scene} />
      {!glb.hasRenderableMesh && <FallBox size={Math.max(20, targetSize * 0.45)} color="#00ff88" />}
    </group>
  );
}

// ═══════════════════════════════════════════
//  BEACON GLOW
// ═══════════════════════════════════════════
function BeaconGlow({ coverage, height = 120 }) {
  const ringRef = useRef();
  useFrame(({ clock: c }) => {
    const t = c.elapsedTime;
    if (ringRef.current)  ringRef.current.material.opacity = 0.12 + Math.sin(t * 2) * 0.07;
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2, 0]} raycast={() => null}>
        <ringGeometry args={[coverage - 4, coverage, 64]} />
        <meshBasicMaterial ref={ringRef} color="#00ff88" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]} raycast={() => null}>
        <circleGeometry args={[coverage, 64]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.04} />
      </mesh>
      <mesh position={[0, height * 0.8, 0]} raycast={() => null}>
        <sphereGeometry args={[6, 16, 16]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={1} transparent opacity={0.9} />
      </mesh>
    </>
  );
}

function BeaconModel({ variant = 'radio', targetSize = 100 }) {
  if (variant === 'radio') {
    return (
      <group>
        <mesh position={[0, targetSize * 0.35, 0]}>
          <cylinderGeometry args={[targetSize * 0.06, targetSize * 0.08, targetSize * 0.7, 12]} />
          <meshStandardMaterial color="#7a8088" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, targetSize * 0.75, 0]}>
          <sphereGeometry args={[targetSize * 0.08, 16, 16]} />
          <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.45} />
        </mesh>
      </group>
    );
  }

  const stemH = targetSize * (variant === 'desk' ? 0.45 : 0.5);
  const shadeY = stemH + targetSize * 0.22;

  return (
    <group>
      <mesh position={[0, targetSize * 0.03, 0]}>
        <cylinderGeometry args={[targetSize * 0.19, targetSize * 0.19, targetSize * 0.06, 20]} />
        <meshStandardMaterial color="#5f6368" roughness={0.65} />
      </mesh>
      <mesh position={[0, stemH * 0.5 + targetSize * 0.06, 0]}>
        <cylinderGeometry args={[targetSize * 0.03, targetSize * 0.03, stemH, 12]} />
        <meshStandardMaterial color="#8c929a" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[0, shadeY, 0]}>
        <cylinderGeometry args={[targetSize * 0.12, targetSize * 0.2, targetSize * 0.24, 20]} />
        <meshStandardMaterial color="#f2f4f7" emissive="#6de6ff" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════
//  FLOOR  (correct rotation: +PI/2 so ShapeY → +Z)
// ═══════════════════════════════════════════
function RoomFloor() {
  const geo = useMemo(() => {
    // Shape uses X,Y coords; after rotateX(+PI/2) Y maps to +Z
    const shape = new THREE.Shape([
      new THREE.Vector2(NW.x, NW.z),   // (-239, -169)
      new THREE.Vector2(NE.x, NE.z),   // ( 239, -169)
      new THREE.Vector2(SE.x, SE.z),   // ( 239,  184)
      new THREE.Vector2(SW.x, SW.z),   // (-239,  154)
    ]);
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);            // ← CORRECT direction: Y→Z
    return g;
  }, []);

  return (
    <mesh geometry={geo} receiveShadow position={[0, -0.5, 0]}>
      <meshStandardMaterial color="#c8bfae" roughness={0.85} />
    </mesh>
  );
}

// ═══════════════════════════════════════════
//  WALLS  (North, East, West, South perfectly connected)
// ═══════════════════════════════════════════
function RoomWalls() {
  const wallMat  = <meshStandardMaterial color="#c0b8a8" roughness={0.88} />;
  const wallMatS = <meshStandardMaterial color="#b5ae9e" roughness={0.88} />;
  const beamMat  = <meshStandardMaterial color="#8a7f70" roughness={0.7} metalness={0.1} />;
  const BEAM = 16; // top beam cross-section

  // South-top diagonal beam angle: SW(-239,154) → SE(239,184)
  const southAngle = Math.atan2(SE.z - SW.z, SE.x - SW.x); // ~3.6°
  const southLen   = Math.sqrt((SE.x - SW.x) ** 2 + (SE.z - SW.z) ** 2); // ≈479cm
  const southMidX  = (SW.x + SE.x) / 2; // 0
  const southMidZ  = (SW.z + SE.z) / 2; // 169

  // Rulers: place small markers and values every 50cm along each wall (top beam)
  const Ticks = ({ len, zDir=false }) => {
    const count = Math.floor(len / 50);
    const marks = [];
    for(let i=1; i<=count; i++){
      const pos = -len/2 + i*50;
      marks.push(
        <group key={i} position={zDir ? [0, BEAM/2 + 2, pos] : [pos, BEAM/2 + 2, 0]}>
          <mesh>
            <boxGeometry args={zDir ? [WALL_T+6, 4, 3] : [3, 4, WALL_T+6]} />
            <meshBasicMaterial color="#ff4444" />
          </mesh>
          <Html position={[0, 8, 0]} center style={{ pointerEvents: 'none' }}>
            <span style={{ 
              color: '#ffdddd', fontSize: '9px', fontWeight: 800, 
              textShadow: '0px 0px 3px #000, 1px 1px 1px #000', whiteSpace: 'nowrap' 
            }}>
              {i*50}
            </span>
          </Html>
        </group>
      );
    }
    return <group>{marks}</group>;
  };

  return (
    <group>
      {/* ── Main walls ── */}
      <mesh position={[0, WALL_H / 2, NW.z]} castShadow receiveShadow>
        <boxGeometry args={[478, WALL_H, WALL_T]} />
        {wallMat}
      </mesh>
      <mesh position={[NE.x, WALL_H / 2, (NE.z + SE.z) / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL_T, WALL_H, 353]} />
        {wallMatS}
      </mesh>
      <mesh position={[NW.x, WALL_H / 2, (NW.z + SW.z) / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL_T, WALL_H, 323]} />
        {wallMatS}
      </mesh>
      {/* South closing wall */}
      <mesh position={[southMidX, WALL_H / 2, southMidZ]} rotation={[0, -southAngle, 0]} castShadow receiveShadow>
        <boxGeometry args={[southLen, WALL_H, WALL_T]} />
        {wallMat}
      </mesh>

      {/* ── Full-height corner posts (connect walls perfectly) ── */}
      {[NW, NE, SE, SW].map((v, i) => (
        <mesh key={i} position={[v.x, WALL_H / 2, v.z]}>
          <boxGeometry args={[WALL_T + 4, WALL_H + BEAM, WALL_T + 4]} />
          {beamMat}
        </mesh>
      ))}

      {/* ── TOP BEAM FRAMES + DIVISIONS (50cm ticks) ── */}
      <mesh position={[0, WALL_H, NW.z]}>
        <boxGeometry args={[478 + BEAM, BEAM, WALL_T + 4]} />
        {beamMat}
        <Ticks len={478} />
      </mesh>
      <mesh position={[NE.x, WALL_H, (NE.z + SE.z) / 2]}>
        <boxGeometry args={[WALL_T + 4, BEAM, 353 + BEAM]} />
        {beamMat}
        <Ticks len={353} zDir />
      </mesh>
      <mesh position={[NW.x, WALL_H, (NW.z + SW.z) / 2]}>
        <boxGeometry args={[WALL_T + 4, BEAM, 323 + BEAM]} />
        {beamMat}
        <Ticks len={323} zDir />
      </mesh>
      <mesh position={[southMidX, WALL_H, southMidZ]} rotation={[0, -southAngle, 0]}>
        <boxGeometry args={[southLen + BEAM, BEAM, WALL_T + 4]} />
        {beamMat}
        <Ticks len={southLen} />
      </mesh>

      {/* ── Label texts ── */}
      <Html position={[0, WALL_H + 30, NW.z - 25]} center>
        <span style={lbl}>N ↔ 478 cm</span>
      </Html>
      <Html position={[NE.x + 35, WALL_H * 0.5, 7]} center>
        <span style={lbl}>E ↕ 353 cm</span>
      </Html>
      <Html position={[NW.x - 35, WALL_H * 0.5, -8]} center>
        <span style={lbl}>W ↕ 323 cm</span>
      </Html>
      <Html position={[0, WALL_H * 0.5, southMidZ + 35]} center>
        <span style={lbl}>S ↔ ~479 cm</span>
      </Html>
    </group>
  );
}
const lbl = { background:'rgba(0,0,0,.7)', color:'#fff', padding:'2px 7px', borderRadius:4, fontSize:11, fontWeight:'bold', whiteSpace:'nowrap', pointerEvents:'none' };

// ═══════════════════════════════════════════
//  ESP32 estimated location (centroid of 3+ antennas)
// ═══════════════════════════════════════════
function ESP32Dot({ antennas }) {
  const r = useRef();
  useFrame(({ clock: c }) => {
    if (r.current) r.current.scale.setScalar(0.85 + Math.sin(c.elapsedTime * 3) * 0.15);
  });
  if (antennas.length < 3) return null;

  // Try to find beacons labeled A, B, C specifically
  const bA = antennas.find(a => a.label?.toUpperCase().includes('A'));
  const bB = antennas.find(a => a.label?.toUpperCase().includes('B'));
  const bC = antennas.find(a => a.label?.toUpperCase().includes('C'));

  let cx, cz;
  if (bA && bB && bC) {
    // If specific ABC beacons exist, we can simulate the trilateration point
    // For visual purposes, we'll just show the centroid but mark it as matched
    cx = (bA.position[0] + bB.position[0] + bC.position[0]) / 3;
    cz = (bA.position[2] + bB.position[2] + bC.position[2]) / 3;
  } else {
    cx = antennas.reduce((s, a) => s + (a.position?.[0] || 0), 0) / antennas.length;
    cz = antennas.reduce((s, a) => s + (a.position?.[2] || 0), 0) / antennas.length;
  }

  return (
    <group position={[cx, 15, cz]}>
      <mesh ref={r} raycast={() => null}>
        <sphereGeometry args={[12, 16, 16]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.8} />
      </mesh>
      <Html position={[0, 35, 0]} center style={{ pointerEvents:'none' }}>
        <div style={{ background:'rgba(0,180,0,0.9)', color:'#fff', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:'bold', whiteSpace:'nowrap', border:'1px solid #fff' }}>
          🌿 Plant (ESP32)
        </div>
      </Html>
    </group>
  );
}

// ═══════════════════════════════════════════
//  PLACED OBJECT  — Using TransformControls
// ═══════════════════════════════════════════
function PlacedObj({ obj, onUpdate }) {
  const { camera, gl } = useThree();
  const { selId, setSelId, orbitRef, snap, snapSz, showLabels, showCov, tfMode } = useContext(Ctx);
  const isSel = selId === obj.id;
  const ref = useRef();
  const mi = getM(obj.model);
  const tSz = MODEL_SIZE[obj.model] ?? 80;
  
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (ref.current) {
      ref.current.position.set(...(obj.position || [0, 0, 0]));
      ref.current.rotation.set(...(obj.rotation || [0, 0, 0]));
      ref.current.scale.set(...(obj.scale || [1, 1, 1]));
    }
  }, [obj.position, obj.rotation, obj.scale]);

  return (
    <>
      {isSel && ready && ref.current && !obj.locked && (
        <TransformControls
          object={ref.current}
          mode={tfMode}
          translationSnap={snap ? snapSz : null}
          rotationSnap={snap ? Math.PI / 8 : null}
          onDraggingChanged={(e) => {
            if (orbitRef.current) orbitRef.current.enabled = !e.value;
            if (!e.value && ref.current) {
              const p = ref.current.position;
              const r = ref.current.rotation;
              onUpdate(obj.id, { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z] });
            }
          }}
        />
      )}
      <group ref={ref}
        position={obj.position || [0, 0, 0]}
        rotation={obj.rotation || [0, 0, 0]}
        scale={obj.scale || [1, 1, 1]}
        onPointerDown={(e) => { e.stopPropagation(); setSelId(obj.id); }}
      >
        <ErrBound>
          <Suspense fallback={<FallBox size={tSz * 0.5} color={mi?.isAntenna ? '#00ff88' : '#6c63ff'} />}>
            {mi?.isAntenna && mi?.beaconVariant && <BeaconModel variant={mi.beaconVariant} targetSize={tSz} />}
            {!mi?.isAntenna && mi?.file && <AutoGLB file={mi.file} targetSize={tSz} />}
          </Suspense>
        </ErrBound>

        {mi?.isAntenna && showCov && <BeaconGlow coverage={obj.coverage ?? 150} height={tSz} />}

        {/* Tight invisible hit-box to ensure we only select the object itself and not anything nearby */}
        <mesh position={[0, tSz / 2, 0]}>
          <boxGeometry args={[tSz * (mi?.isAntenna ? 0.2 : 0.9), tSz, tSz * (mi?.isAntenna ? 0.2 : 0.9)]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#000" />
        </mesh>

        {isSel && (
          <mesh position={[0, tSz * 0.3, 0]}>
            <boxGeometry args={[tSz * 0.95, tSz * 0.6, tSz * 0.95]} />
            <meshBasicMaterial color="#00d4ff" wireframe transparent opacity={0.5} />
          </mesh>
        )}

        {(showLabels || isSel) && (
          <Html position={[0, tSz * 0.7, 0]} center style={{ pointerEvents:'none' }}>
            <span style={{
              background: isSel ? 'rgba(0,212,255,.9)' : 'rgba(0,0,0,.65)',
              color:'#fff', padding:'1px 6px', borderRadius:3,
              fontSize:10, fontWeight:600, whiteSpace:'nowrap',
              border: isSel ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,.15)',
            }}>{obj.label || obj.model}</span>
          </Html>
        )}
      </group>
    </>
  );
}


// ═══════════════════════════════════════════
//  3D SCENE
// ═══════════════════════════════════════════
function Scene({ objects, onUpdate, dropRef, view, insideView }) {
  const { camera, gl, raycaster } = useThree();
  const { orbitRef } = useContext(Ctx);
  const pt = useMemo(() => new THREE.Vector3(), []);

  // Update dropRef for sidebar drag-to-place
  useEffect(() => {
    dropRef.current = (cx, cy) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((cx - rect.left) / rect.width)  * 2 - 1;
      const ndcY = -((cy - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
      const ok = raycaster.ray.intersectPlane(FLOOR_PLANE, pt);
      if (ok && isFinite(pt.x) && isFinite(pt.z)) {
        const x = Math.max(-220, Math.min(220, pt.x));
        const z = Math.max(-150, Math.min(165, pt.z));
        return [x, 0, z];
      }
      return [0, 0, 0];
    };
  }, [camera, gl, raycaster, dropRef, pt]);

  // Update camera and orbit target ONLY when view preset changes
  useEffect(() => {
    if (!orbitRef.current) return;
    const p = CAMS[view];
    if (p) {
      camera.position.set(...p.position);
      camera.fov = p.fov || 50;
      camera.updateProjectionMatrix();
      orbitRef.current.target.set(...(p.target || [0, 0, 0]));
      orbitRef.current.update();
    }
  }, [view, camera, orbitRef]);

  return (
    <>
      <color attach="background" args={['#0e0e20']} />
      <fog attach="fog" args={['#0e0e20', 1000, 2500]} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[200, 600, 150]} intensity={1.4} castShadow shadow-mapSize={[2048,2048]} />
      <hemisphereLight args={['#7ea8d8','#3d2b1f', 0.3]} />

      <gridHelper args={[2000,80,'#1e1e40','#181830']} position={[0,0,0]} />

      <RoomFloor />
      <RoomWalls />

      <Suspense fallback={null}>
        {objects.map(o => <PlacedObj key={o.id} obj={o} onUpdate={onUpdate} />)}
      </Suspense>

      <ESP32Dot antennas={objects.filter(o => getM(o.model)?.isAntenna)} />

      <OrbitControls ref={orbitRef} makeDefault enableDamping dampingFactor={0.08}
        minDistance={insideView ? 20 : 80}
        maxDistance={2500}
        minPolarAngle={0}
        maxPolarAngle={insideView ? Math.PI * 0.98 : Math.PI / 2.05} />

      <GizmoHelper alignment="bottom-right" margin={[80,80]}>
        <GizmoViewport axisColors={['#f87171','#4ade80','#60a5fa']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

// ═══════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════
function Sidebar({ open, onToggle, onAdd }) {
  const [q, setQ] = useState('');
  const [exp, setExp] = useState(new Set(['Beacons','Furniture']));
  const toggle = c => setExp(p => { const n=new Set(p); n.has(c)?n.delete(c):n.add(c); return n; });

  const filtered = Object.entries(CATALOG).reduce((acc,[cat,items]) => {
    const m = q ? items.filter(i=>i.name.toLowerCase().includes(q.toLowerCase())) : items;
    if (m.length) acc[cat] = m; return acc;
  }, {});

  return (
    <div className={`hb-sb ${open?'open':'closed'}`}>
      <div className="hb-sb-hdr">
        {open && <h2>🏗 Objects</h2>}
        <button className="hb-sb-tog" onClick={onToggle}>{open?'◀':'▶'}</button>
      </div>
      {open && <>
        <div className="hb-sb-search"><input placeholder="🔍 Search..." value={q} onChange={e=>setQ(e.target.value)}/></div>
        <p className="hb-sb-hint">💡 Drag, or simply click an item</p>
        <div className="hb-sb-cats">
          {Object.entries(filtered).map(([cat,items]) => (
            <div key={cat} className="hb-cat">
              <button className={`hb-cat-h ${exp.has(cat)?'exp':''}`} onClick={()=>toggle(cat)}>
                <span>{cat}</span><span className="hb-cnt">{items.length}</span><span>{exp.has(cat)?'▾':'▸'}</span>
              </button>
              {exp.has(cat) && (
                <div className="hb-cat-items">
                  {items.map(m => (
                    <div key={m.name} className={`hb-item ${m.isAntenna?'is-ant':''}`}
                      draggable onDragStart={e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('hb-m',m.name);}}
                      onClick={()=>onAdd(m.name)}>
                      <span>{m.icon}</span><span>{m.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="hb-sb-foot">
          <div className="hb-ant-tip">📡 <b>Place 3 Radio towers</b> at room corners for ESP32 trilateration</div>
        </div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════
//  PROPERTIES PANEL
// ═══════════════════════════════════════════
function Props({ obj, onUpdate, onDelete, onDup }) {
  if (!obj) return null;
  const mi = getM(obj.model);
  const rot = (obj.rotation||[0,0,0]).map(r=>((r*180/Math.PI)%360).toFixed(1));
  const sc  = (obj.scale?.[0]||1).toFixed(2);

  const upd = updates => onUpdate(obj.id, updates);
  const pos = i => v => { const p=[...(obj.position||[0,0,0])]; p[i]=+v||0; upd({position:p}); };
  const rot2 = i => v => { const r=[...(obj.rotation||[0,0,0])]; r[i]=(+v||0)*Math.PI/180; upd({rotation:r}); };

  return (
    <div className="hb-props">
      <div className="hb-ph">
        <span>{mi?.icon} {obj.model}</span>
        <div style={{display:'flex',gap:4}}>
          <button className="hb-ib" onClick={()=>onDup(obj)} title="Duplicate">⎘</button>
          <button className="hb-ib hb-del" onClick={()=>onDelete(obj.id)} title="Delete">🗑</button>
        </div>
      </div>

      <div className="hb-ps"><label>Label</label>
        <input type="text" value={obj.label||''} placeholder={obj.model} onChange={e=>upd({label:e.target.value})} /></div>

      {mi?.isAntenna && (
        <div className="hb-ps hb-ant"><label>📡 Coverage cm</label>
          <input type="number" min={50} max={500} step={10} value={obj.coverage??150} onChange={e=>upd({coverage:+e.target.value||150})} /></div>
      )}

      <div className="hb-ps"><label>Position (cm)</label>
        <div className="hb-xyz">
          {['X','Y','Z'].map((a,i)=>(
            <div key={a} className="hb-xf">
              <span className={`hb-ax hb-ax${a.toLowerCase()}`}>{a}</span>
              <input type="number" step="5" value={(obj.position?.[i]||0).toFixed(1)} onChange={e=>pos(i)(e.target.value)}/>
            </div>
          ))}
        </div>
      </div>

      <div className="hb-ps"><label>Rotation °  (Y = spin)</label>
        <div className="hb-xyz">
          {['X','Y','Z'].map((a,i)=>(
            <div key={a} className="hb-xf">
              <span className={`hb-ax hb-ax${a.toLowerCase()}`}>{a}</span>
              <input type="number" step="15" value={rot[i]} onChange={e=>rot2(i)(e.target.value)}/>
            </div>
          ))}
        </div>
      </div>

      <div className="hb-ps"><label>Scale — {sc}×</label>
        <input type="range" min="0.1" max="4" step="0.05" value={obj.scale?.[0]||1}
          onChange={e=>{const s=+e.target.value; upd({scale:[s,s,s]});}} />
        <div style={{display:'flex',gap:5,marginTop:5}}>
          {[0.5,1,2,3].map(v=>(
            <button key={v} className="hb-pre" onClick={()=>upd({scale:[v,v,v]})}>{v}×</button>
          ))}
        </div>
      </div>

      <div className="hb-ps">
        <label className="hb-row">
          <input type="checkbox" checked={!!obj.locked} onChange={e=>upd({locked:e.target.checked})}/>
          🔒 Lock position
        </label>
        <button className="hb-ghost" onClick={()=>upd({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]})}>↺ Reset transform</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  BEACON STATUS
// ═══════════════════════════════════════════
function BeaconBar({ objs }) {
  const ants = objs.filter(o=>getM(o.model)?.isAntenna);
  return (
    <div className="hb-bbar">
      <span className="hb-blab">📡 Beacons:</span>
      {ants.length===0 && <span className="hb-bnone">None placed</span>}
      {ants.map((a,i)=><span key={a.id} className="hb-badge">{a.label||`Beacon ${i+1}`}</span>)}
      {ants.length<3  && <span className="hb-bwarn">⚠ Need {3-ants.length} more</span>}
      {ants.length>=3 && <span className="hb-bok">✓ Triangulation active 📱</span>}
    </div>
  );
}

// ═══════════════════════════════════════════
//  OBJECT LIST
// ═══════════════════════════════════════════
function ObjList({ objs, selId, onSel, onDel }) {
  const [open,setOpen]=useState(false);
  return (
    <div className="hb-ol">
      <button className="hb-ol-tog" onClick={()=>setOpen(v=>!v)}>📦 {objs.length} objects {open?'▴':'▾'}</button>
      {open && (
        <div className="hb-ol-list">
          {objs.length===0 && <div className="hb-ol-empty">Empty — drag items from the sidebar</div>}
          {objs.map(o=>{
            const mi=getM(o.model);
            return (
              <div key={o.id} className={`hb-ol-item ${selId===o.id?'sel':''}`} onClick={()=>onSel(o.id)}>
                <span>{mi?.icon} {o.label||o.model}</span>
                <button className="hb-ib hb-del" onClick={e=>{e.stopPropagation();onDel(o.id);}}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
//  CAMERA PRESETS
// ═══════════════════════════════════════════
// Camera presets — target is the OrbitControls look-at point
const CAMS = {
  // Looking from inside the room toward the north wall (first-person feel)
  Inside:    { position:[0, 130, 90],    fov:75, target:[0, 80, -100], inside:true },
  // Classic bird's eye floor plan
  Top:       { position:[0, 900, 0.01],  fov:55, target:[0, 0, 0],    inside:false },
  // 3D exterior overview
  Outside:   { position:[380, 450, 620], fov:50, target:[0, 80, 0],   inside:false },
  // Isometric-ish
  Isometric: { position:[400, 380, 380], fov:45, target:[0, 80, 0],   inside:false },
};

const SNAP = 25;

// ═══════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════
export default function HouseBuilder3D() {
  const initialObjs = useMemo(() => {
    try {
      const d = localStorage.getItem('hb3d_stable_v1_auto') || localStorage.getItem('hb3d_stable_v1');
      if (d) {
        const p = JSON.parse(d);
        if (p.objects) return sanitizeObjects(p.objects);
      }
    } catch {}
    return [];
  }, []);
  const [objs, setObjs]         = useState(initialObjs);
  const [selId, setSelId]       = useState(null);
  const [sbOpen, setSbOpen]     = useState(true);
  const [view, setView]         = useState('Inside');
  const [tfMode, setTfMode]     = useState('translate');
  const [snap, setSnap]         = useState(false);
  const [showLabels, setLabels] = useState(true);
  const [showCov, setCov]       = useState(true);

  const histRef = useRef([initialObjs]); const histIdx = useRef(0);
  const orbitRef = useRef();
  const dropRef  = useRef(null);
  const wrapRef  = useRef();

  const selObj = objs.find(o=>o.id===selId) ?? null;

  // History
  const push = useCallback(next => {
    histRef.current = [...histRef.current.slice(0, histIdx.current+1), next];
    histIdx.current = histRef.current.length - 1;
  }, []);
  const undo = () => { if(histIdx.current>0){histIdx.current--;setObjs(histRef.current[histIdx.current]);setSelId(null);} };
  const redo = () => { if(histIdx.current<histRef.current.length-1){histIdx.current++;setObjs(histRef.current[histIdx.current]);setSelId(null);} };

  // CRUD
  const addObj = useCallback((name, pos) => {
    const mi = getM(name);
    if (!mi) return;
    const ac = objs.filter(o=>getM(o.model)?.isAntenna).length;
    const o = { id:Date.now()+Math.random(), model:name, position:pos||[0,0,0],
      rotation:[0,0,0], scale:[1,1,1], label:mi?.isAntenna?`Beacon ${ac+1}`:'', locked:false, coverage:150 };
    const clean = sanitizeObject(o);
    if (!clean) return;
    const next=[...objs,clean]; setObjs(next); push(next); setSelId(clean.id);
  }, [objs, push]);

  const updObj = useCallback((id, upd) => {
    setObjs(prev => {
      const next = prev.map(o => (o.id === id ? (sanitizeObject({ ...o, ...upd }) || o) : o));
      push(next);
      return next;
    });
  }, [push]);

  const delObj = useCallback(id => {
    setObjs(prev=>{const next=prev.filter(o=>o.id!==id);push(next);return next;});
    if(selId===id)setSelId(null);
  }, [selId, push]);

  const dupObj = useCallback(o => {
    const n={...o,id:Date.now()+Math.random(),label:o.label?o.label+' 2':'',
      position:[(o.position?.[0]||0)+40,0,(o.position?.[2]||0)+40]};
    const clean = sanitizeObject(n);
    if (!clean) return;
    const next=[...objs,clean];setObjs(next);push(next);setSelId(clean.id);
  }, [objs, push]);

  // Auto-save to localStorage
  useEffect(()=>{
    localStorage.setItem('hb3d_stable_v1_auto', JSON.stringify({ objects:objs, ts:new Date().toISOString() }));
  },[objs]);

  // Drag from sidebar
  const onDragOver = e => { e.preventDefault(); wrapRef.current?.classList.add('drag-over'); };
  const onDragLeave = () => wrapRef.current?.classList.remove('drag-over');
  const onDrop = e => {
    e.preventDefault(); wrapRef.current?.classList.remove('drag-over');
    const name = e.dataTransfer.getData('hb-m'); if(!name) return;
    addObj(name, dropRef.current?.(e.clientX, e.clientY) ?? [0,0,0]);
  };

  // Save / Load
  const save = () => {
    const d = { objects:objs, ts:new Date().toISOString() };
    localStorage.setItem('hb3d_stable_v1', JSON.stringify(d));
    const url=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
    Object.assign(document.createElement('a'),{href:url,download:'house-layout.json'}).click();
    URL.revokeObjectURL(url);
  };
  const load = () => {
    const inp=Object.assign(document.createElement('input'),{type:'file',accept:'.json'});
    inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
      r.onload=ev=>{try{const d=JSON.parse(ev.target.result);const os=sanitizeObjects(d.objects||[]);setObjs(os);push(os);setSelId(null);}catch{alert('Invalid file');}};
      r.readAsText(f);};inp.click();
  };

  // Keyboard shortcuts
  useEffect(()=>{
    const h=e=>{
      const t=document.activeElement?.tagName;
      if(t==='INPUT'||t==='TEXTAREA')return;
      if(e.key==='Escape'){setSelId(null);return;}
      if((e.key==='Delete'||e.key==='Backspace')&&selId){delObj(selId);return;}
      if(e.ctrlKey&&e.key.toLowerCase()==='z'){undo();return;}
      if(e.ctrlKey&&e.key.toLowerCase()==='y'){redo();return;}
      if(e.ctrlKey&&(e.key==='d'||e.key==='D')){e.preventDefault();if(selObj)dupObj(selObj);return;}
      if(e.key==='g'||e.key==='G'){setSnap(v=>!v);}
      if(e.key==='l'||e.key==='L'){setLabels(v=>!v);}
      if(e.key==='r'||e.key==='R'){setTfMode('rotate');}
      if(e.key==='m'||e.key==='M'||e.key==='t'||e.key==='T'){setTfMode('translate');}
    };
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[selId,selObj,delObj,dupObj]);

  const ctxVal = useMemo(()=>({selId,setSelId,orbitRef,snap,snapSz:SNAP,showLabels,showCov,tfMode}),[selId,snap,showLabels,showCov,tfMode]);

  return (
    <Ctx.Provider value={ctxVal}>
      <div className="hb-root">

        {/* HEADER */}
        <header className="hb-hdr">
          <div className="hb-title">
            <span style={{fontSize:'1.7rem'}}>🏠</span>
            <div>
              <h1>3D Workspace Map (Stable)</h1>
              <p>Trapezoid · N:478 · E:353 · W:323 cm · {objs.length} objects</p>
            </div>
          </div>

          <div className="hb-tb">
            <div className="hb-grp">
              <span className="hb-gl">View</span>
              {Object.keys(CAMS).map(v=>
                <button key={v} className={`hb-btn ${view===v?'act':''}`} onClick={()=>setView(v)}>{v}</button>
              )}
            </div>
            <div className="hb-grp">
              <span className="hb-gl">Transform</span>
              <button className={`hb-btn ${tfMode==='translate'?'act':''}`} onClick={()=>setTfMode('translate')}>✋ Move (M)</button>
              <button className={`hb-btn ${tfMode==='rotate'?'act':''}`} onClick={()=>setTfMode('rotate')}>🔄 Rotate (R)</button>
              <button className={`hb-btn ${snap?'act':''}`} onClick={()=>setSnap(v=>!v)}>{snap?'🔲 Snap ON':'⬜ Snap'} (G)</button>
            </div>
            <div className="hb-grp">
              <span className="hb-gl">Tools</span>
              <button className={`hb-btn ${showLabels?'act':''}`} onClick={()=>setLabels(v=>!v)}>🏷 Labels (L)</button>
              <button className={`hb-btn ${showCov?'act':''}`} onClick={()=>setCov(v=>!v)}>📡 Coverage</button>
            </div>
            <div className="hb-grp">
              <span className="hb-gl">Edit</span>
              <button className="hb-btn" onClick={undo}>↩ Undo</button>
              <button className="hb-btn" onClick={redo}>↪ Redo</button>
              {selObj&&<button className="hb-btn" onClick={()=>dupObj(selObj)}>⎘ Dup</button>}
            </div>
            <div className="hb-grp">
              <span className="hb-gl">File</span>
              <button className="hb-btn hb-save" onClick={save}>💾 Save</button>
              <button className="hb-btn" onClick={load}>📂 Load</button>
              <button className="hb-btn hb-danger" onClick={()=>{if(confirm('Clear all objects?')){setObjs([]);setSelId(null);histRef.current=[[]];histIdx.current=0;}}}>🗑 Clear Objects (Keep Walls)</button>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <div className="hb-main">
          <Sidebar open={sbOpen} onToggle={()=>setSbOpen(v=>!v)} onAdd={(name)=>addObj(name, [0,0,0])} />

          <div className="hb-ca">
            <BeaconBar objs={objs} />
            <div className="hb-info">
              <span>🏠 N:478 · E:353 · W:323 cm (trapezoid, open south)</span>
              <span>🎯 {selObj ? `${getM(selObj.model)?.icon} ${selObj.label||selObj.model}` : 'Click to select · drag to move'}</span>
              <span className="hb-hint">Drag from sidebar · Click+drag objects · Scroll=zoom · Right-drag=pan</span>
            </div>

            <ObjList objs={objs} selId={selId} onSel={setSelId} onDel={delObj} />

            <div ref={wrapRef} className="hb-cw"
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
              <Canvas shadows dpr={[1,1.5]}
                gl={{antialias:true,powerPreference:'high-performance'}}
                onPointerMissed={() => setSelId(null)}>
                <Scene objects={objs} onUpdate={updObj} dropRef={dropRef} 
                  view={view} insideView={CAMS[view].inside} />
              </Canvas>
              {objs.length===0 && (
                <div className="hb-empty">
                  <div style={{fontSize:'2.5rem',marginBottom:10,opacity:.4,animation:'hbPulse 2s infinite'}}>📡</div>
                  <p>Drag objects from the sidebar onto the floor</p>
                  <p style={{fontSize:'0.75rem',color:'#4b5563',marginTop:4}}>Start with 3 Radio tower beacons for ESP32 trilateration</p>
                </div>
              )}
            </div>
          </div>

          {selObj && <Props obj={selObj} onUpdate={updObj} onDelete={delObj} onDup={dupObj} />}
        </div>
      </div>
    </Ctx.Provider>
  );
}
