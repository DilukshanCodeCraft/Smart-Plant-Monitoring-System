# Smart Plant Monitoring System: Run Instructions

This guide provides the necessary commands and steps to get the **Smart Plant Monitoring System** running locally on your environment.

---

## 1. Prerequisites
Before starting, ensure you have the following installed:
-   **Node.js** (v18 or higher)
-   **npm** (Node Package Manager)
-   **MongoDB** (Local or MongoDB Atlas)
-   **VS Code** & **Arduino IDE** (for ESP32 code)

---

## 2. Setting Up the Backend
The backend handles data storage and analysis.

1.  **Navigate to the backend folder**:
    ```powershell
    cd "c:\Users\Dilukshan\Desktop\Smart Plant Monitoring System_1\backend"
    ```
2.  **Install dependencies**:
    ```powershell
    npm install
    ```
3.  **Configure environment variables**:
    -   Create or update a `.env` file in the `backend/` folder (base it on `.env.example`).
    -   Ensure `MONGODB_URI` points to your database.
4.  **Initialize the Database** (optional, first-time setup):
    ```powershell
    npm run init:db
    ```
5.  **Start the development server**:
    ```powershell
    npm run dev
    ```
    *The backend will listen on `http://localhost:5000` (or the port specified in `.env`).*

---

## 3. Setting Up the Frontend
The frontend is the React dashboard.

1.  **Navigate to the frontend folder**:
    ```powershell
    cd "c:\Users\Dilukshan\Desktop\Smart Plant Monitoring System_1\frontend"
    ```
2.  **Install dependencies**:
    ```powershell
    npm install
    ```
3.  **Start the Vite development server**:
    ```powershell
    npm run dev
    ```
    *The frontend will usually be available at `http://localhost:5173`.*

---

## 4. Deploying the ESP32 Code
The hardware code resides in the `esp32/` directory.

1.  **Open the Arduino IDE**.
2.  **Load the file**: `esp32/SmartPlantNode.ino`.
3.  **Update Configuration**:
    -   Change `WIFI_SSID` and `WIFI_PASSWORD` to your local network details.
    -   Update `BACKEND_URL` to point to your computer's local IP address (e.g., `http://192.168.1.50:5000/api/readings`).
4.  **Install Libraries**: Ensure you have `BH1750`, `DHT`, `OneWire`, `DallasTemperature`, and `HX711` libraries installed in Arduino IDE.
5.  **Upload**: Select the ESP32 Dev Module board and its COM port, then click **Upload**.
6.  **Monitor**: Open the Serial Monitor (115200 baud) to find the ESP32's assigned IP address.

---

## 5. How to Handle and Run the Application
Follow this sequence to ensure everything syncs correctly:

1.  **Start MongoDB** and the **Backend** server.
2.  **Start the Frontend** and open it in your browser.
3.  **Enter ESP32 IP**: On the Dashboard/Settings page, enter the IP address shown in the ESP32 Serial Monitor.
4.  **Hardware Test**: Try toggling the "Grow Light" or "Water Pump" buttons on the web dashboard. The ESP32 should respond immediately.
5.  **Monitoring**: Click **"Start Monitoring"**.
    -   Observe the dashboard; it should show "Interval 1/10", "Interval 2/10", etc.
    -   After 10 intervals, the dashboard will refresh, and a "Finalized Batch" will be saved to your History.
6.  **Analyze**: View the "History" or "Data Charts" to see the long-term trends of your plant.

---

## 6. Troubleshooting
-   **If sensors show `null`**: Check physical connections to the ESP32 pins (refer to the `PINS` section in the `.ino` file).
-   **If data doesn't save**: Ensure the backend is reachable from the ESP32 (check firewall settings on your PC).
-   **Database Error**: Ensure MongoDB is running and the connection string in the backend `.env` is correct.
