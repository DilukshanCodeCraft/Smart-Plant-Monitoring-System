import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import '../styles/HouseBuilder3D.css';

const DOORWAY_MODEL_HEIGHT = 220;
const ROOM_H = DOORWAY_MODEL_HEIGHT;
const STORAGE_KEY = 'office_pack_builder_v1';

const KEYBOARD_TRANSFORM = {
  moveStepCm: 1,
  rotateStepDeg: 1,
};

// ── Doorway Entry Spaces ──
// Measured from Doorway.glb bbox: width=0.486, maxDimension=1.00953.
// AutoOfficeGLB scales by targetSize/maxDimension, so opening width must follow this ratio.
const DOORWAY_MODEL_BASE_MAX_D = 1.00953;
const DOORWAY_MODEL_BASE_WIDTH = 0.486;
const DOORWAY_OPENING_WIDTH = Math.round((DOORWAY_MODEL_HEIGHT / DOORWAY_MODEL_BASE_MAX_D) * DOORWAY_MODEL_BASE_WIDTH);

const ENTRY_ROOM1_TO_ROOM2 = DOORWAY_OPENING_WIDTH; // Room 1 ↔ Room 2
const ENTRY_ROOM2_TO_ROOM3 = DOORWAY_OPENING_WIDTH; // Room 2 ↔ Room 3
const ENTRY_ROOM3_TO_OUTSIDE = DOORWAY_OPENING_WIDTH; // Room 3 ↔ Outside

// Room 1 (existing) is non-rectangular.
// Room 2 is small width + long length.
// Room 3 is long width + small length.
const SIDE_WEST = 323;
const SIDE_EAST = 353;
const TOP_BOTTOM = 478;
const DELTA_Z_TOP = -15; // top wall z-difference between NW->NE
const HALF_X = Math.sqrt((TOP_BOTTOM * TOP_BOTTOM) - (DELTA_Z_TOP * DELTA_Z_TOP)) / 2;
const Z_MID_TOP = -169;

const NW = new THREE.Vector3(-HALF_X, 0, Z_MID_TOP - DELTA_Z_TOP / 2);
const NE = new THREE.Vector3(HALF_X, 0, Z_MID_TOP + DELTA_Z_TOP / 2);
const SW = new THREE.Vector3(NW.x, 0, NW.z + SIDE_WEST);
const SE = new THREE.Vector3(NE.x, 0, NE.z + SIDE_EAST);
const WALL_T = 12;

// Connected Room 2: width small, length long.
const ROOM2_WIDTH = 180;
const ROOM2_LENGTH = 360;
const room2CenterZ = (NE.z + SE.z) / 2;
const R2_NW = new THREE.Vector3(SE.x, 0, room2CenterZ - ROOM2_LENGTH / 2);
const R2_NE = new THREE.Vector3(SE.x + ROOM2_WIDTH, 0, room2CenterZ - ROOM2_LENGTH / 2);
const R2_SW = new THREE.Vector3(SE.x, 0, room2CenterZ + ROOM2_LENGTH / 2);
const R2_SE = new THREE.Vector3(SE.x + ROOM2_WIDTH, 0, room2CenterZ + ROOM2_LENGTH / 2);

// Connected Room 3: width long, length small.
const ROOM3_WIDTH = 360;
const ROOM3_LENGTH = 170;
const room3CenterX = (R2_NW.x + R2_NE.x) / 2;
const R3_NW = new THREE.Vector3(room3CenterX - ROOM3_WIDTH / 2, 0, R2_NW.z - ROOM3_LENGTH);
const R3_NE = new THREE.Vector3(room3CenterX + ROOM3_WIDTH / 2, 0, R2_NW.z - ROOM3_LENGTH);
const R3_SW = new THREE.Vector3(room3CenterX - ROOM3_WIDTH / 2, 0, R2_NW.z);
const R3_SE = new THREE.Vector3(room3CenterX + ROOM3_WIDTH / 2, 0, R2_NW.z);
const room3NorthCenterX = (R3_NW.x + R3_NE.x) / 2;

const SOUTH_LEN = Math.round(Math.hypot(SE.x - SW.x, SE.z - SW.z));

const WALLS = [
  // Room 1 visible walls (east side open to room 2)
  { key: 'r1-north', from: NW, to: NE, label: 'Room 1: 478 cm', rulerLen: 478 },
  { key: 'r1-south', from: SW, to: SE, label: `Room 1: ${SOUTH_LEN} cm`, rulerLen: SOUTH_LEN },
  { key: 'r1-west', from: NW, to: SW, label: 'Room 1: 323 cm', rulerLen: 323 },

  // Room 2 visible walls (west open to room 1, north open to room 3)
  { key: 'r2-south', from: R2_SW, to: R2_SE, label: 'Room 2: 180 cm', rulerLen: ROOM2_WIDTH },
  { key: 'r2-east', from: R2_NE, to: R2_SE, label: 'Room 2: 360 cm', rulerLen: ROOM2_LENGTH },
  { key: 'r2-west-top', from: R2_NW, to: new THREE.Vector3(R2_NW.x, 0, room2CenterZ - ENTRY_ROOM1_TO_ROOM2 / 2), label: 'Room 2 doorway wall', rulerLen: Math.max(1, ROOM2_LENGTH / 2 - ENTRY_ROOM1_TO_ROOM2 / 2) },
  { key: 'r2-west-bottom', from: new THREE.Vector3(R2_SW.x, 0, room2CenterZ + ENTRY_ROOM1_TO_ROOM2 / 2), to: R2_SW, label: 'Room 2 doorway wall', rulerLen: Math.max(1, ROOM2_LENGTH / 2 - ENTRY_ROOM1_TO_ROOM2 / 2) },

  // Room 3 visible walls (south connects to room 2 only at doorway width)
  { key: 'r3-north-left', from: R3_NW, to: new THREE.Vector3(room3NorthCenterX - ENTRY_ROOM3_TO_OUTSIDE / 2, 0, R3_NW.z), label: 'Room 3 outer doorway wall', rulerLen: Math.max(1, ROOM3_WIDTH / 2 - ENTRY_ROOM3_TO_OUTSIDE / 2) },
  { key: 'r3-north-right', from: new THREE.Vector3(room3NorthCenterX + ENTRY_ROOM3_TO_OUTSIDE / 2, 0, R3_NE.z), to: R3_NE, label: 'Room 3 outer doorway wall', rulerLen: Math.max(1, ROOM3_WIDTH / 2 - ENTRY_ROOM3_TO_OUTSIDE / 2) },
  { key: 'r3-south-left-fill', from: R3_SW, to: R2_NW, label: 'Room 3 south filler wall', rulerLen: Math.max(1, Math.abs(R2_NW.x - R3_SW.x)) },
  { key: 'r3-south-right-fill', from: R2_NE, to: R3_SE, label: 'Room 3 south filler wall', rulerLen: Math.max(1, Math.abs(R3_SE.x - R2_NE.x)) },
  { key: 'r3-east', from: R3_NE, to: R3_SE, label: 'Room 3: 170 cm', rulerLen: ROOM3_LENGTH },
  { key: 'r3-west', from: R3_NW, to: R3_SW, label: 'Room 3: 170 cm', rulerLen: ROOM3_LENGTH },
];

const PARTITION_SEGMENTS = [
  // ── Wall Opening 1: Between Room 1 and Room 2 (West wall of Room 2) ──
  {
    key: 'r1-r2-top',
    from: NE,
    to: new THREE.Vector3(SE.x, 0, room2CenterZ - ENTRY_ROOM1_TO_ROOM2 / 2),
  },
  // ── Wall Opening 2: Between Room 2 and Room 3 (South wall of Room 3) ──
  {
    key: 'r1-r2-bottom',
    from: new THREE.Vector3(SE.x, 0, room2CenterZ + ENTRY_ROOM1_TO_ROOM2 / 2),
    to: SE,
  },
  // ── Wall Opening 3: Left side of Room 2-Room 3 connection ──
  {
    key: 'r2-r3-left',
    from: R2_NW,
    to: new THREE.Vector3(room3CenterX - ENTRY_ROOM2_TO_ROOM3 / 2, 0, R2_NW.z),
  },
  // ── Wall Opening 4: Right side of Room 2-Room 3 connection ──
  {
    key: 'r2-r3-right',
    from: new THREE.Vector3(room3CenterX + ENTRY_ROOM2_TO_ROOM3 / 2, 0, R2_NW.z),
    to: R2_NE,
  },
];

const ROOM_LABELS = [
  { key: 'room-1', text: 'Living Room', x: (NW.x + SE.x) / 2 - 35, z: (NW.z + SW.z) / 2 },
  { key: 'room-2', text: 'Bedroom', x: (R2_NW.x + R2_SE.x) / 2, z: (R2_NW.z + R2_SE.z) / 2 - 20 },
  { key: 'room-3', text: 'Library', x: (R3_NW.x + R3_SE.x) / 2, z: (R3_NW.z + R3_SE.z) / 2 },
];

const ALL_POINTS = [NW, NE, SE, SW, R2_NW, R2_NE, R2_SE, R2_SW, R3_NW, R3_NE, R3_SE, R3_SW];

const X_MIN = Math.min(...ALL_POINTS.map(p => p.x)) + 20;
const X_MAX = Math.max(...ALL_POINTS.map(p => p.x)) - 20;
const Z_MIN = Math.min(...ALL_POINTS.map(p => p.z)) + 20;
const Z_MAX = Math.max(...ALL_POINTS.map(p => p.z)) - 20;
const ORIGIN_X = Math.min(...ALL_POINTS.map(p => p.x));
const ORIGIN_Z = Math.min(...ALL_POINTS.map(p => p.z));

function wallGeom(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  return {
    len,
    midX: (from.x + to.x) / 2,
    midZ: (from.z + to.z) / 2,
    yaw: Math.atan2(-dz, dx),
  };
}

const OFFICE_MODELS = [
  { id: 'chair', name: 'Chair', file: 'office/Chair.glb', targetSize: 80 },
  { id: 'desk', name: 'Desk', file: 'office/Desk.glb', targetSize: 140 },
  { id: 'office-chair', name: 'Office Chair', file: 'office/Office Chair.glb', targetSize: 90 },
  { id: 'cabinet', name: 'Cabinet', file: 'office/Cabinet.glb', targetSize: 120 },
  { id: 'coffee-table', name: 'Coffee Table', file: 'office/Coffee Table.glb', targetSize: 90 },
  { id: 'file-cabinet', name: 'File Cabinet', file: 'office/File Cabinet.glb', targetSize: 120 },
  { id: 'monitor', name: 'Monitor', file: 'office/Monitor.glb', targetSize: 70 },
  { id: 'computer', name: 'Computer', file: 'office/Computer.glb', targetSize: 70 },
  { id: 'computer-screen', name: 'Computer Screen', file: 'office/Computer Screen.glb', targetSize: 70 },
  { id: 'ceiling-light', name: 'Ceiling Light', file: 'office/Ceiling Light.glb', targetSize: 70 },
  { id: 'ceiling-fan', name: 'Ceiling Fan', file: 'office/Ceiling Fan.glb', targetSize: 110 },
  { id: 'lamp', name: 'Lamp', file: 'office/Lamp.glb', targetSize: 90 },
  { id: 'book-shelf', name: 'Medium Book Shelf', file: 'office/Medium Book Shelf.glb', targetSize: 170 },
  { id: 'shelf', name: 'Shelf', file: 'office/Shelf.glb', targetSize: 150 },
  { id: 'table', name: 'Table', file: 'office/Table.glb', targetSize: 130 },
  { id: 'table-large', name: 'Table Large Circular', file: 'office/Table Large Circular.glb', targetSize: 160 },
  { id: 'vending-machine', name: 'Vending Machine', file: 'office/Vending Machine.glb', targetSize: 200 },
  { id: 'water-cooler', name: 'Water Cooler', file: 'office/Water Cooler.glb', targetSize: 180 },
  { id: 'whiteboard', name: 'Whiteboard', file: 'office/Whiteboard.glb', targetSize: 180 },
  { id: 'doorway', name: 'Entry Frame', file: 'office/Doorway.glb', targetSize: DOORWAY_MODEL_HEIGHT },
  { id: 'doorway-front', name: 'Front Entry Frame', file: 'office/Doorway Front.glb', targetSize: DOORWAY_MODEL_HEIGHT },
  { id: 'houseplant', name: 'Houseplant', file: 'office/Houseplant.glb', targetSize: 100 },
  { id: 'potted-plant', name: 'Potted Plant', file: 'office/Potted Plant.glb', targetSize: 90 },
  { id: 'plant-white-pot', name: 'Plant White Pot', file: 'office/Plant - White Pot.glb', targetSize: 90 },
];

/* ── Persistence ─────────────────────────────────────────────── */
function readStoredObjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.objects) ? parsed.objects : [];
  } catch { return []; }
}
function persistObjs(objs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects: objs, ts: new Date().toISOString() }));
}

/* ── Room (walls always present) ────────────────────────────── */
function Room() {
  const floorParts = useMemo(() => {
    const FLOOR_INSET = WALL_T / 2 + 0.5;

    const room1 = new THREE.Shape([
      new THREE.Vector2(NW.x + FLOOR_INSET, NW.z + FLOOR_INSET),
      new THREE.Vector2(NE.x - FLOOR_INSET, NE.z + FLOOR_INSET),
      new THREE.Vector2(SE.x - FLOOR_INSET, SE.z - FLOOR_INSET),
      new THREE.Vector2(SW.x + FLOOR_INSET, SW.z - FLOOR_INSET),
    ]);

    const room2 = new THREE.Shape([
      new THREE.Vector2(R2_NW.x + FLOOR_INSET, R2_NW.z + FLOOR_INSET),
      new THREE.Vector2(R2_NE.x - FLOOR_INSET, R2_NE.z + FLOOR_INSET),
      new THREE.Vector2(R2_SE.x - FLOOR_INSET, R2_SE.z - FLOOR_INSET),
      new THREE.Vector2(R2_SW.x + FLOOR_INSET, R2_SW.z - FLOOR_INSET),
    ]);

    const room3 = new THREE.Shape([
      new THREE.Vector2(R3_NW.x + FLOOR_INSET, R3_NW.z + FLOOR_INSET),
      new THREE.Vector2(R3_NE.x - FLOOR_INSET, R3_NE.z + FLOOR_INSET),
      new THREE.Vector2(R3_SE.x - FLOOR_INSET, R3_SE.z - FLOOR_INSET),
      new THREE.Vector2(R3_SW.x + FLOOR_INSET, R3_SW.z - FLOOR_INSET),
    ]);

    const makeFloor = (shape) => {
      const geom = new THREE.ShapeGeometry(shape);
      geom.rotateX(-Math.PI / 2);
      return geom;
    };

    return [
      { key: 'room-1-floor', geometry: makeFloor(room1), color: '#d6d1ca', roughness: 0.68, metalness: 0.03 },
      { key: 'room-2-floor', geometry: makeFloor(room2), color: '#d6d1ca', roughness: 0.68, metalness: 0.03 },
    ];
  }, []);

  return (
    <group>
      {floorParts.map((part) => (
        <mesh key={part.key} geometry={part.geometry} position={[0, 0.62, 0]} receiveShadow>
          <meshStandardMaterial
            color={part.color}
            roughness={part.roughness}
            metalness={part.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Keep Room 3 floor always visible, but inset so it never crosses wall boundaries */}
      <mesh
        position={[room3CenterX, 0.64, R2_NW.z - ROOM3_LENGTH / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[ROOM3_WIDTH - (WALL_T + 1), ROOM3_LENGTH - (WALL_T + 1)]} />
        <meshStandardMaterial color="#d6d1ca" roughness={0.68} metalness={0.03} side={THREE.DoubleSide} />
      </mesh>

      {WALLS.map(({ key, from, to }) => {
        const { len, midX, midZ, yaw } = wallGeom(from, to);
        return (
          <mesh key={key} position={[midX, ROOM_H / 2, midZ]} rotation={[0, yaw, 0]} castShadow>
            <boxGeometry args={[len, ROOM_H, WALL_T]} />
            <meshStandardMaterial color="#bdb4a5" />
          </mesh>
        );
      })}

      {PARTITION_SEGMENTS.map(({ key, from, to }) => {
        const { len, midX, midZ, yaw } = wallGeom(from, to);
        return (
          <mesh key={key} position={[midX, ROOM_H / 2, midZ]} rotation={[0, yaw, 0]} castShadow>
            <boxGeometry args={[len, ROOM_H, WALL_T]} />
            <meshStandardMaterial color="#a79a88" />
          </mesh>
        );
      })}

      {ROOM_LABELS.map(({ key, text, x, z }) => (
        <Html key={key} position={[x, 8, z]} center style={{ pointerEvents: 'none' }}>
          <span style={{ background: 'rgba(15, 23, 42, 0.78)', color: '#f8fafc', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
            {text}
          </span>
        </Html>
      ))}
    </group>
  );
}

/* ── GLB fallback ────────────────────────────────────────────── */
function FallbackBox({ size = 60 }) {
  return (
    <mesh position={[0, size * 0.5, 0]}>
      <boxGeometry args={[size * 0.6, size * 0.6, size * 0.6]} />
      <meshStandardMaterial color="#6d89b0" transparent opacity={0.75} />
    </mesh>
  );
}

/* ── GLB loader with autoscale ───────────────────────────────── */
function AutoOfficeGLB({ file, targetSize }) {
  const { scene } = useGLTF(`/models/${file}`);
  const [tx, setTx] = useState({ s: 1, y: 0 });

  useEffect(() => {
    try {
      const box = new THREE.Box3().setFromObject(scene);
      if (!box.isEmpty()) {
        const sz = box.getSize(new THREE.Vector3());
        const maxD = Math.max(sz.x, sz.y, sz.z);
        if (maxD > 0 && Number.isFinite(maxD)) {
          const scale = Math.min(Math.max(targetSize / maxD, 0.001), 50000);
          setTx({ s: scale, y: -(box.min.y * scale) });
        }
      }
    } catch { setTx({ s: 1, y: 0 }); }
  }, [scene, targetSize]);

  const prepared = useMemo(() => {
    const cloned = scene.clone(true);
    let hasRenderableMesh = false;
    cloned.traverse(child => {
      if (child.isLight) { child.intensity = 0; child.castShadow = false; }
      if (child.isMesh || child.isSkinnedMesh) hasRenderableMesh = true;
      child.raycast = () => null;
    });
    return { scene: cloned, hasRenderableMesh };
  }, [scene]);

  return (
    <group scale={tx.s} position={[0, tx.y, 0]}>
      <primitive object={prepared.scene} />
      {!prepared.hasRenderableMesh && <FallbackBox size={Math.max(30, targetSize * 0.5)} />}
    </group>
  );
}

/* ── Office object node with integrated TransformControls ───── */
function OfficeObject({ item, selected, onSelect, transformMode, axisLock, orbitRef, onTransformCommit }) {
  const groupRef = useRef();
  const [refReady, setRefReady] = useState(false);
  const hs = item.targetSize || 90;
  const isTransforming = selected && transformMode !== 'select';

  return (
    <>
      {/* TransformControls gizmo — shown only when selected AND in move/rotate mode */}
      {isTransforming && refReady && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode === 'rotate' ? 'rotate' : 'translate'}
          showX={axisLock === null || axisLock === 'X'}
          showY={axisLock === null || axisLock === 'Y'}
          showZ={axisLock === null || axisLock === 'Z'}
          onMouseDown={() => { if (orbitRef?.current) orbitRef.current.enabled = false; }}
          onMouseUp={() => {
            if (orbitRef?.current) orbitRef.current.enabled = true;
            const obj3d = groupRef.current;
            if (obj3d) {
              onTransformCommit(item.id, {
                position: [obj3d.position.x, obj3d.position.y, obj3d.position.z],
                rotationX: obj3d.rotation.x,
                rotationY: obj3d.rotation.y,
                rotationZ: obj3d.rotation.z,
              });
            }
          }}
        />
      )}

      <group
        ref={el => { groupRef.current = el; if (el && !refReady) setRefReady(true); }}
        position={item.position || [0, 0, 0]}
        rotation={[item.rotationX || 0, item.rotationY || 0, item.rotationZ || 0]}
        scale={[item.scale || 1, item.scale || 1, item.scale || 1]}
        onPointerDown={e => { e.stopPropagation(); onSelect(item.id); }}
      >
        <Suspense fallback={<FallbackBox size={hs * 0.5} />}>
          <AutoOfficeGLB file={item.file} targetSize={item.targetSize || 90} />
        </Suspense>

        {/* Invisible hit volume */}
        <mesh position={[0, hs * 0.4, 0]}>
          <boxGeometry args={[hs * 0.95, hs * 0.9, hs * 0.95]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Selection wireframe */}
        {selected && (
          <mesh position={[0, hs * 0.4, 0]}>
            <boxGeometry args={[hs * 1.08, hs * 1.0, hs * 1.08]} />
            <meshBasicMaterial color="#00d4ff" wireframe transparent opacity={0.5} />
          </mesh>
        )}

      </group>
    </>
  );
}

/* ── createObject helper ─────────────────────────────────────── */
function createObject(model) {
  return {
    id: Date.now() + Math.random(),
    label: model.name,
    file: model.file,
    targetSize: model.targetSize,
    position: [0, 0, 0],
    rotationY: 0,
    scale: 1,
  };
}

/* ── Main export ─────────────────────────────────────────────── */
export default function OfficePackBuilder3D() {
  const [objects, setObjects] = useState(readStoredObjects);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [interactMode, setInteractMode] = useState('select'); // 'select' | 'move' | 'rotate'
  const [axisLock, setAxisLock] = useState(null);    // null | 'X' | 'Y' | 'Z'
  const [sideTab, setSideTab] = useState('inventory'); // 'inventory' | 'catalog'
  const [histRev, setHistRev] = useState(0);
  const [detectedRoom, setDetectedRoom] = useState(null);

  // Refs for event-handler safe access
  const historyRef = useRef(null);
  const histIdxRef = useRef(0);
  const liveObjectsRef = useRef(objects);
  const selectedIdRef = useRef(null);
  const objectsRef = useRef(objects);
  const interactModeRef = useRef('select');
  const axisLockRef = useRef(null);
  const orbitRef = useRef();

  if (historyRef.current === null) {
    historyRef.current = [JSON.parse(JSON.stringify(objects))];
  }

  useEffect(() => { liveObjectsRef.current = objects; objectsRef.current = objects; }, [objects]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { interactModeRef.current = interactMode; }, [interactMode]);
  useEffect(() => { axisLockRef.current = axisLock; }, [axisLock]);

  const selected = useMemo(() => objects.find(o => o.id === selectedId) || null, [objects, selectedId]);
  const canUndo = histRev >= 0 && histIdxRef.current > 0;
  const canRedo = histRev >= 0 && histIdxRef.current < historyRef.current.length - 1;

  /* ── Live Potted Plant Tracker ── */
  useEffect(() => {
    let active = true;
    async function pollLiveLocation() {
      if (!active) return;
      try {
        const payload = await api.getSecondaryBoardStatus();
        const roomStr = payload?.status?.nearestRoom || '';
        setDetectedRoom(roomStr);

        // Match string to Room Centers
        let targetPos = null;
        if (roomStr.toLowerCase().includes('living')) targetPos = { x: ROOM_LABELS[0].x + 35, z: ROOM_LABELS[0].z + 30 }; // add slight offset from text
        else if (roomStr.toLowerCase().includes('bed')) targetPos = { x: ROOM_LABELS[1].x - 30, z: ROOM_LABELS[1].z + 20 };
        else if (roomStr.toLowerCase().includes('library')) targetPos = { x: ROOM_LABELS[2].x + 40, z: ROOM_LABELS[2].z - 30 };

        if (targetPos) {
          setObjects(prev => {
            const plantExists = prev.some(o => o.label === 'Potted Plant');
            if (!plantExists) return prev;

            let changed = false;
            const next = prev.map(o => {
              if (o.label === 'Potted Plant') {
                const px = o.position ? o.position[0] : 0;
                const pz = o.position ? o.position[2] : 0;
                if (Math.abs(px - targetPos.x) > 5 || Math.abs(pz - targetPos.z) > 5) {
                  changed = true;
                  return { ...o, position: [targetPos.x, 0, targetPos.z] };
                }
              }
              return o;
            });

            if (changed) {
              liveObjectsRef.current = next;
              objectsRef.current = next;
              return next;
            }
            return prev;
          });
        }
      } catch (err) { }
      if (active) setTimeout(pollLiveLocation, 3000);
    }

    pollLiveLocation();
    return () => { active = false; };
  }, []);

  /* ── History ── */
  const pushHistory = useCallback(nextObjs => {
    const trimmed = historyRef.current.slice(0, histIdxRef.current + 1);
    trimmed.push(JSON.parse(JSON.stringify(nextObjs)));
    historyRef.current = trimmed;
    histIdxRef.current = trimmed.length - 1;
    setHistRev(v => v + 1);
    setObjects(nextObjs);
    persistObjs(nextObjs);
  }, []);

  const transformSelectedByKeyboard = useCallback((patch) => {
    const id = selectedIdRef.current;
    if (!id) return false;

    const next = liveObjectsRef.current.map(o => {
      if (o.id !== id) return o;

      const pos = o.position || [0, 0, 0];
      return {
        ...o,
        position: [
          pos[0] + (patch.dx || 0),
          pos[1] + (patch.dy || 0),
          pos[2] + (patch.dz || 0),
        ],
        rotationX: (o.rotationX || 0) + (patch.dRx || 0),
        rotationY: (o.rotationY || 0) + (patch.dRy || 0),
        rotationZ: (o.rotationZ || 0) + (patch.dRz || 0),
      };
    });

    pushHistory(next);
    return true;
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    setHistRev(v => v + 1);
    const prev = JSON.parse(JSON.stringify(historyRef.current[histIdxRef.current]));
    setObjects(prev); persistObjs(prev); setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current++;
    setHistRev(v => v + 1);
    const next = JSON.parse(JSON.stringify(historyRef.current[histIdxRef.current]));
    setObjects(next); persistObjs(next);
  }, []);

  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const moveStep = KEYBOARD_TRANSFORM.moveStepCm;
      const rotateStep = THREE.MathUtils.degToRad(KEYBOARD_TRANSFORM.rotateStepDeg);

      // Undo / Redo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }
      // Mode shortcuts (case-insensitive)
      const k = e.key.toLowerCase();
      if (k === 'm') { setInteractMode('move'); setAxisLock(null); return; }
      if (k === 'r') { setInteractMode('rotate'); setAxisLock(null); return; }
      if (k === 'escape' || k === 's') { setInteractMode('select'); setAxisLock(null); setSelectedId(null); return; }

      // Keyboard move controls (when an object is selected and Move mode is active)
      // Hold key to keep nudging because browser key-repeat keeps firing keydown.
      if (interactModeRef.current === 'move' && selectedIdRef.current) {
        if (e.key === 'x' || e.key === 'X') { e.preventDefault(); if (transformSelectedByKeyboard({ dx: e.shiftKey ? -moveStep : moveStep })) return; }
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); if (transformSelectedByKeyboard({ dy: e.shiftKey ? -moveStep : moveStep })) return; }
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); if (transformSelectedByKeyboard({ dz: e.shiftKey ? -moveStep : moveStep })) return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (transformSelectedByKeyboard({ dz: -moveStep })) return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (transformSelectedByKeyboard({ dz: moveStep })) return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); if (transformSelectedByKeyboard({ dx: -moveStep })) return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); if (transformSelectedByKeyboard({ dx: moveStep })) return; }
        if (e.key === 'PageUp') { e.preventDefault(); if (transformSelectedByKeyboard({ dy: moveStep })) return; }
        if (e.key === 'PageDown') { e.preventDefault(); if (transformSelectedByKeyboard({ dy: -moveStep })) return; }
      }

      // Keyboard rotate controls (when an object is selected and Rotate mode is active)
      if (interactModeRef.current === 'rotate' && selectedIdRef.current) {
        if (e.key === 'x' || e.key === 'X') { e.preventDefault(); if (transformSelectedByKeyboard({ dRx: e.shiftKey ? -rotateStep : rotateStep })) return; }
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); if (transformSelectedByKeyboard({ dRy: e.shiftKey ? -rotateStep : rotateStep })) return; }
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); if (transformSelectedByKeyboard({ dRz: e.shiftKey ? -rotateStep : rotateStep })) return; }
        if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); if (transformSelectedByKeyboard({ dRy: -rotateStep })) return; }
        if (e.key === 'e' || e.key === 'E') { e.preventDefault(); if (transformSelectedByKeyboard({ dRy: rotateStep })) return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (transformSelectedByKeyboard({ dRx: -rotateStep })) return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (transformSelectedByKeyboard({ dRx: rotateStep })) return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); if (transformSelectedByKeyboard({ dRz: -rotateStep })) return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); if (transformSelectedByKeyboard({ dRz: rotateStep })) return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, transformSelectedByKeyboard]);

  /* ── Object actions ── */
  const addObject = model => {
    const obj = createObject(model);
    const next = [...liveObjectsRef.current, obj];
    pushHistory(next);
    setSelectedId(obj.id);
    setSideTab('inventory');
  };

  const updateSelected = patch => {
    if (!selectedId) return;
    const next = liveObjectsRef.current.map(o => o.id === selectedId ? { ...o, ...patch } : o);
    pushHistory(next);
  };

  async function applyRoomOverride(room) {
    const toastId = toast.loading('Syncing plant position...');
    try {
      await api.setSecondaryRoomOverride(room);
      if (room) {
        toast.success(`Movement Detected! 🪴 Plant shifted to: ${room}`, { id: toastId, duration: 6000 });
      } else {
        toast.success('Position override cleared.', { id: toastId, duration: 3000 });
      }
    } catch (err) {
      toast.error(err.message, { id: toastId });
    }
  }

  const deleteSelected = () => {
    if (!selectedId) return;
    const next = liveObjectsRef.current.filter(o => o.id !== selectedId);
    pushHistory(next); setSelectedId(null);
  };

  const deleteObject = id => {
    const next = liveObjectsRef.current.filter(o => o.id !== id);
    pushHistory(next);
    if (selectedId === id) setSelectedId(null);
  };

  const renameObject = (id, newLabel) => {
    const next = liveObjectsRef.current.map(o => o.id === id ? { ...o, label: newLabel } : o);
    liveObjectsRef.current = next;
    objectsRef.current = next;
    setObjects(next); persistObjs(next);
  };

  const commitRename = () => {
    const curr = liveObjectsRef.current;
    const trimmed = historyRef.current.slice(0, histIdxRef.current + 1);
    trimmed.push(JSON.parse(JSON.stringify(curr)));
    historyRef.current = trimmed;
    histIdxRef.current = trimmed.length - 1;
    setHistRev(v => v + 1);
  };

  /* ── TransformControls commit (fired on gizmo mouseUp) ── */
  const onTransformCommit = useCallback((id, patch) => {
    const curr = liveObjectsRef.current.map(o => o.id === id ? { ...o, ...patch } : o);
    liveObjectsRef.current = curr;
    objectsRef.current = curr;
    const trimmed = historyRef.current.slice(0, histIdxRef.current + 1);
    trimmed.push(JSON.parse(JSON.stringify(curr)));
    historyRef.current = trimmed;
    histIdxRef.current = trimmed.length - 1;
    setHistRev(v => v + 1);
    setObjects(curr);
    persistObjs(curr);
  }, []);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? OFFICE_MODELS.filter(m => m.name.toLowerCase().includes(q)) : OFFICE_MODELS;
  }, [query]);

  const btnOff = { opacity: 0.35, cursor: 'not-allowed' };

  const axisLabel = axisLock ? ` [ ${axisLock} ]` : '';
  const modeHint =
    interactMode === 'move' ? `↔ Move${axisLabel} · X/Y/Z = +1cm axis move (hold key) · Shift+X/Y/Z = -1cm` :
      interactMode === 'rotate' ? `↻ Rotate${axisLabel} · X/Y/Z = +1° axis rotate (hold key) · Shift+X/Y/Z = -1°` :
        'Keys: M=move R=rotate Esc=deselect · Ctrl+Z/Y undo/redo';

  const selectedCoords = selected
    ? `(${Math.round(selected.position[0] - ORIGIN_X)}, ${Math.round(selected.position[2] - ORIGIN_Z)}) cm`
    : null;

  return (
    <div className="hb-root">
      {/* ── Header ── */}
      <header className="hb-hdr">
        <div className="hb-title">
          <span style={{ fontSize: '1.5rem' }}>O</span>
          <div>
            <h1>Office Pack 3D Builder</h1>
            <p>Undo/Redo · Move/Rotate · Inventory</p>
          </div>
        </div>

        <div className="hb-tb">
          {/* Edit */}
          <div className="hb-grp">
            <span className="hb-gl">Edit</span>
            <button className="hb-btn" onClick={undo} disabled={!canUndo} title="Ctrl+Z" style={!canUndo ? btnOff : {}}>↩ Undo</button>
            <button className="hb-btn" onClick={redo} disabled={!canRedo} title="Ctrl+Y" style={!canRedo ? btnOff : {}}>↪ Redo</button>
            <button className="hb-btn hb-danger" onClick={() => { pushHistory([]); setSelectedId(null); }}>Clear</button>
          </div>

          {/* Mode */}
          <div className="hb-grp">
            <span className="hb-gl">Mode</span>
            <button className={`hb-btn${interactMode === 'select' ? ' act' : ''}`} onClick={() => { setInteractMode('select'); setAxisLock(null); }} title="Esc / S">Select</button>
            <button className={`hb-btn${interactMode === 'move' ? ' act' : ''}`} onClick={() => { setInteractMode('move'); setAxisLock(null); }} title="M">Move</button>
            <button className={`hb-btn${interactMode === 'rotate' ? ' act' : ''}`} onClick={() => { setInteractMode('rotate'); setAxisLock(null); }} title="R">Rotate</button>
          </div>

          {/* Axis lock (visible only in move/rotate) */}
          {interactMode !== 'select' && (
            <div className="hb-grp">
              <span className="hb-gl">Lock</span>
              {['X', 'Y', 'Z'].map(ax => (
                <button
                  key={ax}
                  className={`hb-btn${axisLock === ax ? ' act' : ''}`}
                  style={ax === 'X' ? { color: '#f87171' } : ax === 'Y' ? { color: '#4ade80' } : { color: '#60a5fa' }}
                  onClick={() => setAxisLock(v => v === ax ? null : ax)}
                  title={`Lock to ${ax} axis (press ${ax})`}
                >
                  {ax}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="hb-main">
        {/* ── Left sidebar: Inventory + Catalog tabs ── */}
        <aside className="hb-sb open" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #252550' }}>
            {[
              { key: 'inventory', label: `Scene (${objects.length})` },
              { key: 'catalog', label: '+ Add' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setSideTab(t.key)}
                style={{
                  flex: 1, padding: '8px 4px', fontSize: 11, fontWeight: 600,
                  border: 'none', cursor: 'pointer', background: 'transparent',
                  color: sideTab === t.key ? '#00d4ff' : '#555',
                  borderBottom: `2px solid ${sideTab === t.key ? '#00d4ff' : 'transparent'}`,
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Inventory tab – placed objects, with rename */}
          {sideTab === 'inventory' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {objects.length === 0 && (
                <div style={{ color: '#444', fontSize: 12, padding: '20px 12px', textAlign: 'center', lineHeight: 1.7 }}>
                  No objects placed yet.<br />
                  <span style={{ color: '#6699cc' }}>Switch to &ldquo;+ Add&rdquo; to begin.</span>
                </div>
              )}
              {objects.map(obj => {
                const model = OFFICE_MODELS.find(m => m.id === obj.file?.replace('office/', '').replace('.glb', '')) || null;
                const isSel = obj.id === selectedId;
                return (
                  <div
                    key={obj.id}
                    onClick={() => setSelectedId(obj.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px', cursor: 'pointer',
                      background: isSel ? 'rgba(0,212,255,0.1)' : 'transparent',
                      borderLeft: `3px solid ${isSel ? '#00d4ff' : 'transparent'}`,
                      transition: 'background 0.13s',
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                      background: '#152535',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: '#7aaccc', fontWeight: 700,
                    }}>
                      {obj.label.slice(0, 2).toUpperCase()}
                    </span>
                    <input
                      value={obj.label}
                      onChange={e => renameObject(obj.id, e.target.value)}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                      title="Click to rename"
                      style={{
                        flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                        outline: 'none', color: '#ccc', fontSize: 12, fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); deleteObject(obj.id); }}
                      style={{
                        background: 'none', border: 'none', color: '#c44', cursor: 'pointer',
                        fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0,
                      }}
                      title="Delete"
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Catalog tab – search + add */}
          {sideTab === 'catalog' && (
            <>
              <div className="hb-sb-search" style={{ paddingTop: 8 }}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search office models…" />
              </div>
              <div className="hb-sb-cats" style={{ paddingTop: 6 }}>
                {filteredCatalog.map(model => (
                  <button key={model.id} className="hb-item" onClick={() => addObject(model)}>
                    <span style={{ fontSize: 9, fontWeight: 700 }}>{model.name.slice(0, 2).toUpperCase()}</span>
                    <span>{model.name}</span>
                  </button>
                ))}
                {filteredCatalog.length === 0 && <div className="hb-ol-empty">No matching models.</div>}
              </div>
            </>
          )}
        </aside>

        {/* ── Canvas area ── */}
        <div className="hb-ca">
          <div className="hb-info">
            <span>{modeHint}</span>
            {selectedCoords && (
              <span style={{ color: '#4fa', fontFamily: 'monospace', fontSize: 11 }}>
                ● {selected.label} {selectedCoords}
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>Objects: {objects.length}</span>
          </div>

          <div className="hb-cw">
            <Canvas
              camera={{ position: [0, 980, 1], fov: 52 }}
              shadows
              onPointerMissed={() => { if (interactModeRef.current === 'select') setSelectedId(null); }}
            >
              <color attach="background" args={['#0e0e20']} />
              <ambientLight intensity={0.68} />
              <directionalLight castShadow position={[220, 420, 180]} intensity={1.25} />
              <gridHelper args={[2000, 80, '#1e1e40', '#181830']} position={[0, 0.5, 0]} />

              <Room />

              {objects.map(item => (
                <OfficeObject
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={setSelectedId}
                  transformMode={interactMode}
                  axisLock={axisLock}
                  orbitRef={orbitRef}
                  onTransformCommit={onTransformCommit}
                />
              ))}

              <OrbitControls
                ref={orbitRef}
                makeDefault
                enableDamping
                dampingFactor={0.08}
                target={[0, 0, 0]}
                minPolarAngle={0}
                maxPolarAngle={Math.PI / 2 - 0.02}
                minDistance={70}
                maxDistance={1800}
              />
            </Canvas>
          </div>
        </div>

        {/* ── Manual Room Override Floating Panel ── */}
        <div
          className="hb-remote-control"
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '24px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => applyRoomOverride('Living room')}
              style={{ 
                padding: '8px 16px', 
                background: '#3b82f6', 
                color: 'white', 
                border: detectedRoom?.includes('Living') ? '2px solid white' : '2px solid transparent', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 600,
                boxShadow: detectedRoom?.includes('Living') ? '0 0 15px rgba(59, 130, 246, 0.8)' : 'none'
              }}
              title="Living Room"
            >1</button>
            <button
              onClick={() => applyRoomOverride('Bed room')}
              style={{ 
                padding: '8px 16px', 
                background: '#8b5cf6', 
                color: 'white', 
                border: detectedRoom?.includes('Bed') ? '2px solid white' : '2px solid transparent', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 600,
                boxShadow: detectedRoom?.includes('Bed') ? '0 0 15px rgba(139, 92, 246, 0.8)' : 'none'
              }}
              title="Bed Room"
            >2</button>
            <button
              onClick={() => applyRoomOverride('Library')}
              style={{ 
                padding: '8px 16px', 
                background: '#10b981', 
                color: 'white', 
                border: detectedRoom?.includes('Library') ? '2px solid white' : '2px solid transparent', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 600,
                boxShadow: detectedRoom?.includes('Library') ? '0 0 15px rgba(16, 185, 129, 0.8)' : 'none'
              }}
              title="Library"
            >3</button>
            <button
              onClick={() => applyRoomOverride(null)}
              style={{ padding: '8px 14px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              title="Clear Override"
            >×</button>
          </div>
        </div>

        {/* ── Right inspector ── */}
        {selected && (
          <aside className="hb-props">
            <div className="hb-ph">
              <span>{selected.label}</span>
              <button className="hb-ib hb-del" onClick={deleteSelected} title="Delete">×</button>
            </div>

            <div className="hb-ps">
              <label>Name</label>
              <input
                key={selected.id}
                type="text"
                defaultValue={selected.label}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                onBlur={e => {
                  const nextName = (e.target.value || '').trim() || 'Unnamed';
                  renameObject(selected.id, nextName);
                  commitRename();
                }}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </div>

            <div className="hb-ps">
              <label>Position X / Z</label>
              <div className="hb-xyz">
                <div className="hb-xf">
                  <span className="hb-ax hb-axx">X</span>
                  <input
                    type="number" step="5"
                    value={Math.round(selected.position[0])}
                    onChange={e => {
                      const x = Math.max(X_MIN, Math.min(X_MAX, Number(e.target.value) || 0));
                      updateSelected({ position: [x, 0, selected.position[2]] });
                    }}
                  />
                </div>
                <div className="hb-xf">
                  <span className="hb-ax hb-axz">Z</span>
                  <input
                    type="number" step="5"
                    value={Math.round(selected.position[2])}
                    onChange={e => {
                      const z = Math.max(Z_MIN, Math.min(Z_MAX, Number(e.target.value) || 0));
                      updateSelected({ position: [selected.position[0], 0, z] });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="hb-ps">
              <label>
                Rotate Y&nbsp;
                <span style={{ color: '#888', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  {Math.round(selected.rotationY * 180 / Math.PI)}°
                </span>
              </label>
              <input
                type="range" min={-180} max={180} step={5}
                value={Math.round(selected.rotationY * 180 / Math.PI)}
                onChange={e => updateSelected({ rotationY: Number(e.target.value) * Math.PI / 180 })}
              />
            </div>

            <div className="hb-ps">
              <label>
                Scale&nbsp;
                <span style={{ color: '#888', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  {selected.scale.toFixed(2)}×
                </span>
              </label>
              <input
                type="range" min={0.5} max={3} step={0.05}
                value={selected.scale}
                onChange={e => updateSelected({ scale: Number(e.target.value) || 1 })}
              />
            </div>

            <div className="hb-ps" style={{ borderBottom: 'none' }}>
              <div style={{ fontSize: 10, color: '#556', lineHeight: 1.7 }}>
                {interactMode === 'select' && <span>Switch to Move/Rotate mode to use XYZ gizmos.</span>}
                {interactMode === 'move' && <span style={{ color: '#5a8' }}>↔ Drag the red/green/blue arrows to move on each axis.</span>}
                {interactMode === 'rotate' && <span style={{ color: '#5a8' }}>↻ Drag the colored rings to rotate on each axis.</span>}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
