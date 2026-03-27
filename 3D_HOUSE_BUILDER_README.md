# 🏠 3D House Builder

A web-based 3D house layout designer with drag-and-drop furniture placement and antenna positioning for location tracking.

## Features

### Core Functionality
- **3D View**: Interactive three.js canvas with orbit controls
- **House Floor Plan**: Configurable dimensions (478 × 353 cm in this build)
- **Drag-and-Drop**: Drag models from library to canvas to place objects
- **Object Properties**: Adjust position, rotation, and scale via sliders and numeric inputs
- **Library Library**: 
  - Antennas & Beacons (for ESP32 location tracking)
  - Furniture (desks, chairs, tables, lamps)
  - Environmental (vents, windows, doors)
  - Utilities (plant pots, storage bins)

### Data Persistence
- **localStorage**: Save and load layouts locally in your browser
- **Backend Ready**: Routes prepared for MongoDB persistence (future enhancement)

## How to Use

### 1. Placing Objects
- Click **"Show Library"** to open the model library (left sidebar)
- **Drag any model** from the library into the 3D canvas
- The object appears at the drop location
- **3 Antennas**: Drag the Antenna model 3 times for location beacon placement

### 2. Selecting & Modifying Objects
- **Click an object** in the canvas to select it
- **Right panel** opens with properties for that object
- **Adjust Position**: Use X/Y/Z sliders and number inputs
- **Rotate**: Use rotation sliders (in degrees)
- **Scale**: Adjust size with X/Y/Z scale sliders
- **Reset Scale**: Button to restore to 1.0, 1.0, 1.0

### 3. Managing the Layout
- **Save Layout**: Persists current design to browser localStorage
- **Load Layout**: Restores previously saved design
- **Clear Scene**: Removes all objects (cannot be undone)
- **Hide Library**: Toggle sidebar for more canvas space

## GLB Models

The system loads 3D models in GLB format from `/public/models/`:
- `Antenna.glb` - WiFi/BLE beacon for location tracking
- Additional models from "Office Pack" and "Ultimate Interior Props Pack" (populate as needed)

### Adding More Models
1. Copy `.glb` files to `frontend/public/models/`
2. Add model name to `ModelLibrary.jsx` in the appropriate category
3. Restart the dev server

## Antenna Placement (3 Positions)

For optimal ESP32 BLE location tracking:
1. **Place Antenna #1** at one corner of your house
2. **Place Antenna #2** at opposite corner
3. **Place Antenna #3** at a third strategic location

**Hint**: Use the property inspector to position antennas at known coordinates for RSSI trilateration.

## Camera Controls

- **Rotate**: Hold middle mouse button + drag
- **Pan**: Hold right mouse button + drag  
- **Zoom**: Scroll wheel

## Technical Stack

- **Renderer**: Three.js via @react-three/fiber
- **UI**: React with hooks
- **State**: React useState + localStorage
- **Styling**: CSS with CSS variables for theming
- **Models**: GLB format (Three GLTFLoader)

## Keyboard Shortcuts (Future)

- `D` - Delete selected object
- `R` - Reset scale
- `S` - Save layout
- `L` - Load layout
- `Esc` - Deselect object

## Troubleshooting

### Models Not Loading
- Check browser console for CORS errors
- Ensure `.glb` files are in `frontend/public/models/`
- Verify file names match exactly in ModelLibrary.jsx

### Scene Too Dark
- Adjust orbit controls zoom or initial camera position in HouseBuilder3D.jsx
- The grid and corner markers help with orientation

### Save/Load Not Working
- Check browser console for storage quota errors
- Clear browser cache if layout won't load after save
- Use browser DevTools → Application → localStorage to view saved data

## Future Enhancements

- [ ] Backend persistence via `/api/house-layout` routes
- [ ] Multi-room support with floor plans
- [ ] Real-time collaboration (WebSockets)
- [ ] Environmental zone visualization (light coverage, air flow, heat)
- [ ] Plant placement suggestions based on conditions
- [ ] Export as 2D/3D model
- [ ] Measurement tools
- [ ] Preset room templates

## File Structure

```
frontend/
├── src/
│   ├── pages/
│   │   └── HouseBuilder3D.jsx       # Main page component
│   ├── components/3D/
│   │   ├── HouseFloor.jsx           # Floor plan rendering
│   │   ├── ModelLibrary.jsx         # Model selection sidebar
│   │   └── ObjectProperties.jsx     # Property inspector
│   └── styles/
│       ├── HouseBuilder3D.css       # Page styles
│       ├── ModelLibrary.css         # Library sidebar styles
│       └── ObjectProperties.css     # Inspector styles
└── public/models/                    # GLB assets
```

---

**Build**: v0.1 - MVP with drag-drop, 3D visualization, and localStorage persistence
