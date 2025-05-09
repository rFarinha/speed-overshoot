import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './App.css';

function App() {
  const [startSpeed, setStartSpeed] = useState(0);
  const [endSpeed, setEndSpeed] = useState(100);
  const [duration, setDuration] = useState(1000);
  const [acceleration, setAcceleration] = useState(0);
  const [maxOvershoot, setMaxOvershoot] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [maxValue, setMaxValue] = useState(0);

  const calculateResults = () => {
    const startVal = Number(startSpeed);
    const endVal = Number(endSpeed);
    const durationVal = Number(duration);
    
    if (durationVal <= 0) {
      alert("Duration must be greater than 0");
      return;
    }

    const accel = (endVal - startVal) / durationVal;
    setAcceleration(accel);

    const senderInterval = 105;
    const receiverInterval = 20;
    
    const getActualSpeed = (time) => {
      if (time <= durationVal) {
        return startVal + accel * time;
      } else {
        return endVal;
      }
    };
    
    const receivedData = [];
    for (let time = 0; time <= durationVal + 2 * senderInterval; time += senderInterval) {
      receivedData.push({
        time,
        speed: getActualSpeed(time)
      });
    }
    
    const chartData = [];
    const maxTime = durationVal + 2 * senderInterval;
    
    for (let time = 0; time <= maxTime; time += receiverInterval) {
      const previousPoints = receivedData
        .filter(p => p.time <= time)
        .slice(-2);
      
      let interpolatedSpeed;
      
      if (previousPoints.length === 1) {
        interpolatedSpeed = previousPoints[0].speed;
      } else {
        const [p1, p2] = previousPoints;
        const slope = (p2.speed - p1.speed) / (p2.time - p1.time);
        interpolatedSpeed = p2.speed + slope * (time - p2.time);
      }
      
      chartData.push({
        time,
        actual: getActualSpeed(time),
        received: receivedData.find(p => p.time <= time && p.time > time - senderInterval)?.speed || startVal,
        interpolated: interpolatedSpeed
      });
    }
    
    let maxSpeed = endVal;
    chartData.forEach(point => {
      if (point.interpolated > maxSpeed) {
        maxSpeed = point.interpolated;
      }
    });
    
    const overshoot = maxSpeed - endVal;
    setMaxOvershoot(overshoot);
    setChartData(chartData);
    setMaxValue(Math.max(maxSpeed, endVal) * 1.1);
  };

  useEffect(() => {
    calculateResults();
  }, [startSpeed, endSpeed, duration]);

  return (
    <div className="app-container">
      <h2 className="app-title">Speed Interpolation Calculator (km/h)</h2>
      
      <div className="input-grid">
        <div className="input-container">
          <label className="input-label">Start Speed (km/h):</label>
          <input
            type="number"
            value={startSpeed}
            onChange={(e) => setStartSpeed(Number(e.target.value))}
            className="input-field"
          />
        </div>
        
        <div className="input-container">
          <label className="input-label">End Speed (km/h):</label>
          <input
            type="number"
            value={endSpeed}
            onChange={(e) => setEndSpeed(Number(e.target.value))}
            className="input-field"
          />
        </div>
        
        <div className="input-container">
          <label className="input-label">Duration (ms):</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="input-field"
            min="1"
          />
        </div>
      </div>
      
      <div className="output-grid">
        <div className="output-container acceleration-container">
          <h3 className="explanation-title">Acceleration:</h3>
          <p className="text-xl">{acceleration.toFixed(4)} km/h/ms</p>
          <p className="text-lg">({(acceleration * 1000).toFixed(2)} km/h/second)</p>
        </div>
        
        <div className="output-container overshoot-container">
          <h3 className="explanation-title">Maximum Overshoot:</h3>
          <p className="text-xl">{maxOvershoot.toFixed(2)} km/h</p>
          <p className="text-lg">({((maxOvershoot / endSpeed) * 100).toFixed(2)}% of end speed)</p>
        </div>
      </div>
      
      <div className="chart-container">
        <h3 className="chart-title">Speed Visualization:</h3>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -5 }} 
              />
              <YAxis 
                domain={[0, maxValue]} 
                label={{ value: 'Speed (km/h)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke="#2563eb" 
                name="Actual Speed (Continuous)" 
                dot={false} 
                strokeWidth={2}
              />
              <Line 
                type="step" 
                dataKey="received" 
                stroke="#9333ea" 
                name="Received Speed (105ms)" 
                dot={false}
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="interpolated" 
                stroke="#10b981" 
                name="Interpolated Speed (20ms)" 
                dot={false}
                strokeWidth={2}
              />
              <ReferenceLine y={endSpeed} stroke="red" strokeDasharray="3 3" label="End Speed" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="explanation-container">
        <h3 className="explanation-title">Explanation:</h3>
        <p>This tool simulates a system where speed data is sent every 105ms but needed every 20ms:</p>
        <ul className="explanation-list">
          <li>The <span className="text-blue font-medium">blue line</span> shows the continuous/ideal speed over time</li>
          <li>The <span className="text-purple font-medium">purple line</span> shows the actual speed values received every 105ms (step function)</li>
          <li>The <span className="text-green font-medium">green line</span> shows the interpolated speed using linear regression based on the two most recent received points</li>
          <li>The interpolation continues its trajectory until a new actual value is received</li>
          <li>Maximum overshoot occurs when the interpolation exceeds the final target speed</li>
        </ul>
      </div>
    </div>
  );
}

export default App;