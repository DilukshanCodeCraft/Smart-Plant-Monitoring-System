import React from 'react';
import '../../styles/ObjectProperties.css';

export default function ObjectProperties({ object, onUpdate, onDelete }) {
  if (!object) return null;

  const handlePositionChange = (axis, value) => {
    const newPos = [...object.position];
    newPos[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = parseFloat(value);
    onUpdate({ position: newPos });
  };

  const handleRotationChange = (axis, value) => {
    const newRot = [...object.rotation];
    const deg = (parseFloat(value) * Math.PI) / 180;
    newRot[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = deg;
    onUpdate({ rotation: newRot });
  };

  const handleScaleChange = (axis, value) => {
    const newScale = [...object.scale];
    newScale[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = parseFloat(value);
    onUpdate({ scale: newScale });
  };

  const rotationDegrees = {
    x: (object.rotation[0] * 180) / Math.PI,
    y: (object.rotation[1] * 180) / Math.PI,
    z: (object.rotation[2] * 180) / Math.PI
  };

  return (
    <div className="object-properties">
      <div className="properties-header">
        <h3>🔧 Properties</h3>
        <div className="object-label">{object.model}</div>
      </div>

      <div className="properties-section">
        <h4>Position</h4>
        <div className="property-group">
          <label>X: {object.position[0].toFixed(1)}</label>
          <input
            type="range"
            min="-300"
            max="300"
            step="5"
            value={object.position[0]}
            onChange={(e) => handlePositionChange('x', e.target.value)}
            className="slider"
          />
          <input
            type="number"
            min="-300"
            max="300"
            step="1"
            value={object.position[0].toFixed(1)}
            onChange={(e) => handlePositionChange('x', e.target.value)}
            className="input-number"
          />
        </div>

        <div className="property-group">
          <label>Y: {object.position[1].toFixed(1)}</label>
          <input
            type="range"
            min="-50"
            max="500"
            step="5"
            value={object.position[1]}
            onChange={(e) => handlePositionChange('y', e.target.value)}
            className="slider"
          />
          <input
            type="number"
            min="-50"
            max="500"
            step="1"
            value={object.position[1].toFixed(1)}
            onChange={(e) => handlePositionChange('y', e.target.value)}
            className="input-number"
          />
        </div>

        <div className="property-group">
          <label>Z: {object.position[2].toFixed(1)}</label>
          <input
            type="range"
            min="-300"
            max="300"
            step="5"
            value={object.position[2]}
            onChange={(e) => handlePositionChange('z', e.target.value)}
            className="slider"
          />
          <input
            type="number"
            min="-300"
            max="300"
            step="1"
            value={object.position[2].toFixed(1)}
            onChange={(e) => handlePositionChange('z', e.target.value)}
            className="input-number"
          />
        </div>
      </div>

      <div className="properties-section">
        <h4>Rotation (degrees)</h4>
        <div className="property-group">
          <label>X: {rotationDegrees.x.toFixed(0)}°</label>
          <input
            type="range"
            min="-180"
            max="180"
            step="5"
            value={rotationDegrees.x}
            onChange={(e) => handleRotationChange('x', e.target.value)}
            className="slider"
          />
        </div>

        <div className="property-group">
          <label>Y: {rotationDegrees.y.toFixed(0)}°</label>
          <input
            type="range"
            min="-180"
            max="180"
            step="5"
            value={rotationDegrees.y}
            onChange={(e) => handleRotationChange('y', e.target.value)}
            className="slider"
          />
        </div>

        <div className="property-group">
          <label>Z: {rotationDegrees.z.toFixed(0)}°</label>
          <input
            type="range"
            min="-180"
            max="180"
            step="5"
            value={rotationDegrees.z}
            onChange={(e) => handleRotationChange('z', e.target.value)}
            className="slider"
          />
        </div>
      </div>

      <div className="properties-section">
        <h4>Scale</h4>
        <div className="property-group">
          <label>X: {object.scale[0].toFixed(2)}</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={object.scale[0]}
            onChange={(e) => handleScaleChange('x', e.target.value)}
            className="slider"
          />
        </div>

        <div className="property-group">
          <label>Y: {object.scale[1].toFixed(2)}</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={object.scale[1]}
            onChange={(e) => handleScaleChange('y', e.target.value)}
            className="slider"
          />
        </div>

        <div className="property-group">
          <label>Z: {object.scale[2].toFixed(2)}</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={object.scale[2]}
            onChange={(e) => handleScaleChange('z', e.target.value)}
            className="slider"
          />
        </div>

        <button 
          className="btn-small"
          onClick={() => onUpdate({ scale: [1, 1, 1] })}
        >
          Reset Scale
        </button>
      </div>

      <div className="properties-section">
        <h4>Actions</h4>
        <button 
          className="btn-danger btn-block"
          onClick={onDelete}
        >
          🗑️ Delete Object
        </button>
      </div>

      <div className="properties-info">
        <p><strong>ID:</strong> {object.id}</p>
      </div>
    </div>
  );
}
