import React, { useState, useEffect } from 'react';
import '../../styles/ModelLibrary.css';

const AVAILABLE_MODELS = {
  'Antennas & Beacons': [
    { name: 'Antenna', icon: '📡', description: 'WiFi/Beacon Antenna' }
  ],
  'Furniture': [
    { name: 'Adjustable Desk', icon: '🪑', description: 'Adjustable Work Desk' },
    { name: 'Chair', icon: '🪑', description: 'Office Chair' },
    { name: 'Office Chair', icon: '🪑', description: 'Executive Office Chair' },
    { name: 'Table', icon: '📦', description: 'Meeting Table' },
    { name: 'Desk', icon: '📚', description: 'Work Desk' },
    { name: 'Couch Medium', icon: '🛋️', description: 'Medium Couch' },
    { name: 'Night Stand', icon: '📦', description: 'Night Stand' },
    { name: 'Cabinet', icon: '📦', description: 'Storage Cabinet' },
  ],
  'Environmental': [
    { name: 'Air Vent', icon: '💨', description: 'Air ventilation vent' },
    { name: 'Lamp', icon: '💡', description: 'Table Lamp' },
    { name: 'Floor Lamp', icon: '💡', description: 'Floor Lamp' },
    { name: 'Ceiling Light', icon: '💡', description: 'Ceiling Light' },
    { name: 'Window Blinds', icon: '🪟', description: 'Window with Blinds' },
    { name: 'Doorway', icon: '🚪', description: 'Door Frame' },
    { name: 'Curtains Double', icon: '🪟', description: 'Double Curtains' },
  ],
  'Utilities': [
    { name: 'Potted Plant', icon: '🌱', description: 'Plant in Pot' },
    { name: 'Houseplant', icon: '🌿', description: 'House Plant' },
    { name: 'Bins', icon: '🗑️', description: 'Trash Bin' },
    { name: 'Trash Bin', icon: '🗑️', description: 'Garbage Bin' },
    { name: 'Computer', icon: '💻', description: 'Desktop Computer' },
    { name: 'Monitor', icon: '🖥️', description: 'Computer Monitor' },
    { name: 'Printer', icon: '🖨️', description: 'Office Printer' },
  ],
  'Decorations': [
    { name: 'Wall Art 02', icon: '🎨', description: 'Wall Decoration' },
    { name: 'Blank Picture Frame', icon: '🖼️', description: 'Picture Frame' },
    { name: 'Analog clock', icon: '🕐', description: 'Analog Clock' },
    { name: 'Rug', icon: '🟤', description: 'Floor Rug' },
    { name: 'Shelf', icon: '📚', description: 'Book Shelf' },
  ]
};

export default function ModelLibrary() {
  const [filter, setFilter] = useState('');
  const [expandedCategory, setExpandedCategory] = useState('Antennas & Beacons');

  const filteredModels = Object.entries(AVAILABLE_MODELS).reduce((acc, [category, models]) => {
    const filtered = models.filter(m =>
      m.name.toLowerCase().includes(filter.toLowerCase()) ||
      m.description.toLowerCase().includes(filter.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {});

  const handleDragStart = (e, modelName) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('model', modelName);
  };

  return (
    <div className="model-library">
      <div className="library-header">
        <h2>📦 Model Library</h2>
        <input
          type="text"
          placeholder="Search models..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="library-info">
        <p className="hint">💡 Drag models into the canvas to place them</p>
        <p className="hint">📍 Antennas: For location tracking with ESP32</p>
      </div>

      <div className="library-content">
        {Object.entries(filteredModels).map(([category, models]) => (
          <div key={category} className="model-category">
            <button
              className="category-header"
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
            >
              <span className="category-arrow">
                {expandedCategory === category ? '▼' : '▶'}
              </span>
              <span className="category-name">{category}</span>
              <span className="category-count">({models.length})</span>
            </button>

            {expandedCategory === category && (
              <div className="models-grid">
                {models.map((model) => (
                  <div
                    key={model.name}
                    draggable
                    onDragStart={(e) => handleDragStart(e, model.name)}
                    className="model-card"
                    title={model.description}
                  >
                    <div className="model-icon">{model.icon}</div>
                    <div className="model-name">{model.name}</div>
                    <div className="model-description">{model.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {Object.keys(filteredModels).length === 0 && (
          <div className="no-results">
            <p>No models match your search</p>
          </div>
        )}
      </div>

      <div className="library-footer">
        <details>
          <summary>📋 Help & Tips</summary>
          <ul>
            <li><strong>Placement:</strong> Drag models from library to canvas</li>
            <li><strong>Antennas:</strong> Place 3 antennas for optimal coverage</li>
            <li><strong>Selection:</strong> Click objects in canvas to select them</li>
            <li><strong>Properties:</strong> Use right panel to adjust position, rotation, scale</li>
            <li><strong>Save:</strong> Use "Save Layout" to persist your design</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
