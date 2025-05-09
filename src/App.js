import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './App.css';

function App() {
  const [startSpeed, setStartSpeed] = useState(0);
  const [endSpeed, setEndSpeed] = useState(30);
  const [duration, setDuration] = useState(1000);
  const [initialJerk, setInitialJerk] = useState(0.3); // Bezier control point (0-1)
  const [finalJerk, setFinalJerk] = useState(0.3); // Bezier control point (0-1)
  const [useJerk, setUseJerk] = useState(false); // Toggle for jerk-based vs linear interpolation
  const [acceleration, setAcceleration] = useState(0);
  const [maxOvershoot, setMaxOvershoot] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [distanceData, setDistanceData] = useState([]);
  const [maxValue, setMaxValue] = useState(0);
  const [minValue, setMinValue] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [stabilizationDistance, setStabilizationDistance] = useState(0);
  const [durationDistance, setDurationDistance] = useState(0);
  
  // Values for test environment
  const [physicalJerkA, setPhysicalJerkA] = useState(0);
  const [physicalJerkB, setPhysicalJerkB] = useState(0);

  // Calculate physical jerk values from Bezier control points
  const calculatePhysicalJerkValues = (startVal, endVal, durationVal, initialJerkFactor, finalJerkFactor) => {
    // Convert to m/s
    const startMS = startVal / 3.6;
    const endMS = endVal / 3.6;
    const durationS = durationVal / 1000;
    
    // Calculate speed change
    const speedChange = endMS - startMS;
    
    // Get acceleration from a linear profile (as a reference)
    const avgAccel = speedChange / durationS;
    
    // The Bezier control points affect how quickly we reach max acceleration and decelerate
    // Lower initialJerkFactor means faster acceleration at the start
    // Lower finalJerkFactor means faster deceleration at the end
    
    // Convert Bezier factors to physical jerks
    // These formulas are approximations to achieve similar curve shapes
    // We scale by the average acceleration and duration to get appropriate jerk values
    const jerkA = Math.abs(avgAccel) * (2.0 - initialJerkFactor) / (durationS * initialJerkFactor);
    const jerkB = Math.abs(avgAccel) * (2.0 - finalJerkFactor) / (durationS * finalJerkFactor);
    
    // Ensure positive values
    return {
      jerkA: Math.max(0.01, jerkA),
      jerkB: Math.max(0.01, jerkB)
    };
  };

  const calculateResults = () => {
    const startVal = Number(startSpeed);
    const endVal = Number(endSpeed);
    const durationVal = Number(duration);
    const initialJerkVal = Number(initialJerk);
    const finalJerkVal = Number(finalJerk);
    
    if (durationVal <= 0) {
      alert("Duration must be greater than 0");
      return;
    }

    // Calculate average acceleration in km/h per millisecond
    const avgAccelKmhPerMs = (endVal - startVal) / durationVal;
    
    // Convert acceleration to m/s²
    // 1 km/h = 0.27778 m/s
    // 1 ms = 0.001 s
    // So, (km/h)/ms * 0.27778 / 0.001 = (km/h)/ms * 277.78 = m/s²
    const avgAccelMsSquared = avgAccelKmhPerMs * 277.78;
    setAcceleration(avgAccelMsSquared);
    
    if (useJerk) {
      // Calculate physical jerk values for test environment
      const jerkValues = calculatePhysicalJerkValues(startVal, endVal, durationVal, initialJerkVal, finalJerkVal);
      setPhysicalJerkA(jerkValues.jerkA);
      setPhysicalJerkB(jerkValues.jerkB);
    }

    const senderInterval = 105;
    const receiverInterval = 20;
    
    // Function to calculate speed at a given time
    const getActualSpeed = (time) => {
      if (time <= 0) return startVal;
      if (time >= durationVal) return endVal;
      
      if (useJerk) {
        // Use Bezier curve for jerk-based speed profile
        // Convert time to normalized position (0-1)
        const t = time / durationVal;
        
        // Calculate the cubic Bezier parameters based on jerk
        // Initial jerk affects the first control point
        // Final jerk affects the second control point
        const cp1 = initialJerkVal;  // First control point (affects initial curve)
        const cp2 = 1 - finalJerkVal; // Second control point (affects final curve)
        
        // Cubic Bezier function: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        // Where P₀ is 0, P₃ is 1, P₁ and P₂ are control points affecting curve
        const bezierFactor = 
          Math.pow(1-t, 3) * 0 + 
          3 * Math.pow(1-t, 2) * t * cp1 + 
          3 * (1-t) * Math.pow(t, 2) * cp2 + 
          Math.pow(t, 3) * 1;
        
        // Apply bezier curve to speed calculation
        return startVal + (endVal - startVal) * bezierFactor;
      } else {
        // Use linear interpolation for original behavior
        return startVal + avgAccelKmhPerMs * time;
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
    const distanceData = [];
    const maxTime = durationVal + 2 * senderInterval;
    
    // Variables to calculate distance
    let cumulativeDistance = 0;
    let lastTime = 0;
    let lastSpeed = startVal;
    let lastInterpolatedSpeed = startVal;
    let stabilizationTime = null;
    let stabilizationDistanceVal = 0;
    let durationDistanceVal = 0;
    let hasFoundStabilization = false;
    
    // Define tolerance for stabilization
    const stabilizationTolerance = 0.1; // km/h
    
    // Track minimum and maximum interpolated speeds for optimized y-axis
    let minInterpolatedSpeed = startVal;
    let maxInterpolatedSpeed = startVal;
    
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
      
      // Update min/max interpolated speeds
      minInterpolatedSpeed = Math.min(minInterpolatedSpeed, interpolatedSpeed);
      maxInterpolatedSpeed = Math.max(maxInterpolatedSpeed, interpolatedSpeed);
      
      // Find the latest received value at or before this time
      const latestReceivedPoint = receivedData
        .filter(p => p.time <= time)
        .slice(-1)[0];
      
      const actualSpeed = getActualSpeed(time);
      
      // Calculate distance traveled in this interval (in meters)
      // Using interpolated speed for the distance calculation
      // Convert km/h to m/s: speed * (1000m / 1km) * (1h / 3600s) = speed * 1000 / 3600 = speed / 3.6
      // Time interval in seconds: (time - lastTime) / 1000
      const timeIntervalInSeconds = (time - lastTime) / 1000;
      const avgSpeedInMs = (interpolatedSpeed + lastInterpolatedSpeed) / 2 / 3.6; // Average interpolated speed in m/s
      const intervalDistance = avgSpeedInMs * timeIntervalInSeconds;
      
      cumulativeDistance += intervalDistance;
      
      // Track distance at duration point
      if (time >= durationVal && durationDistanceVal === 0) {
        durationDistanceVal = cumulativeDistance;
      }
      
      // Check for stabilization (when interpolated speed is close to end speed)
      if (!hasFoundStabilization && time > durationVal && 
          Math.abs(interpolatedSpeed - endVal) <= stabilizationTolerance) {
        stabilizationTime = time;
        stabilizationDistanceVal = cumulativeDistance;
        hasFoundStabilization = true;
      }
      
      chartData.push({
        time,
        actual: actualSpeed,
        received: latestReceivedPoint ? latestReceivedPoint.speed : startVal,
        interpolated: interpolatedSpeed
      });
      
      distanceData.push({
        time,
        distance: cumulativeDistance,
        interpolatedSpeed: interpolatedSpeed
      });
      
      // Update for next iteration
      lastTime = time;
      lastSpeed = actualSpeed;
      lastInterpolatedSpeed = interpolatedSpeed;
    }
    
    // Set the distances
    setTotalDistance(cumulativeDistance);
    setStabilizationDistance(stabilizationDistanceVal);
    setDurationDistance(durationDistanceVal);
    
    // Calculate maximum overshoot (or undershoot) based on whether we're accelerating or decelerating
    let extremeSpeed = endVal;
    let overshoot = 0;
    
    if (startVal < endVal) {
      // Acceleration case - find maximum (overshoot above endVal)
      chartData.forEach(point => {
        if (point.interpolated > extremeSpeed) {
          extremeSpeed = point.interpolated;
        }
      });
      overshoot = extremeSpeed - endVal;
    } else {
      // Deceleration case - find minimum (undershoot below endVal)
      extremeSpeed = endVal;
      chartData.forEach(point => {
        if (point.interpolated < extremeSpeed) {
          extremeSpeed = point.interpolated;
        }
      });
      overshoot = endVal - extremeSpeed;
    }
    
    setMaxOvershoot(Math.abs(overshoot));
    setChartData(chartData);
    setDistanceData(distanceData);
    
    // Set optimized chart min/max values with padding (max/min ±2 km/h)
    // Ensure the range includes start speed, end speed, and any overshoot/undershoot
    const speedValues = [startVal, endVal, minInterpolatedSpeed, maxInterpolatedSpeed];
    const minSpeed = Math.min(...speedValues);
    const maxSpeed = Math.max(...speedValues);
    
    // Add 2 km/h padding on each side (or more if overshoot requires it)
    const paddingAboveMax = Math.max(2, maxSpeed - endVal + 1);
    const paddingBelowMin = Math.max(2, endVal - minSpeed + 1);
    
    setMaxValue(maxSpeed + paddingAboveMax);
    setMinValue(Math.max(0, minSpeed - paddingBelowMin)); // Don't go below 0 unless necessary
  };

  useEffect(() => {
    calculateResults();
  }, [startSpeed, endSpeed, duration, initialJerk, finalJerk, useJerk]);

  // Custom formatter for Y-axis to limit decimal places
  const formatYAxis = (value) => {
    return value.toFixed(1);
  };

  // Custom formatter for tooltip to limit decimal places
  const formatTooltipValue = (value, name) => {
    if (name === "distance") {
      return value.toFixed(1) + " m";
    } else if (name === "interpolatedSpeed") {
      return value.toFixed(1) + " km/h";
    }
    return value.toFixed(1) + " km/h";
  };
  
  // Calculate the percentage based on the situation
  const calculatePercentage = () => {
    if (startSpeed < endSpeed) {
      // Acceleration: percentage of end speed
      return ((maxOvershoot / Math.abs(endSpeed || 1)) * 100).toFixed(2);
    } else {
      // Deceleration: percentage of start speed (since it's the reference)
      return ((maxOvershoot / Math.abs(startSpeed || 1)) * 100).toFixed(2);
    }
  };

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
      
      <div className="jerk-toggle-container">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={useJerk}
            onChange={() => setUseJerk(!useJerk)}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="toggle-label">
          Use Jerk-Based Speed Profile (S-Curve)
        </span>
      </div>
      
      {useJerk && (
        <>
          <div className="input-grid jerk-input-grid">
            <div className="input-container jerk-container">
              <label className="input-label">Initial Jerk Factor (0-1):</label>
              <input
                type="number"
                value={initialJerk}
                onChange={(e) => setInitialJerk(Number(e.target.value))}
                className="input-field"
                min="0.1"
                max="1"
                step="0.1"
              />
              <div className="input-hint">Controls curve at start (0=sharp, 1=gradual)</div>
            </div>
            
            <div className="input-container jerk-container">
              <label className="input-label">Final Jerk Factor (0-1):</label>
              <input
                type="number"
                value={finalJerk}
                onChange={(e) => setFinalJerk(Number(e.target.value))}
                className="input-field"
                min="0.1"
                max="1"
                step="0.1"
              />
              <div className="input-hint">Controls curve at end (0=sharp, 1=gradual)</div>
            </div>
          </div>
        
        </>
      )}
      
      <div className="output-grid">
        <div className="output-container acceleration-container">
          <h3 className="explanation-title">Acceleration:</h3>
          <p className="text-xl">{acceleration.toFixed(2)} m/s²</p>
          <p className="text-lg">({acceleration > 0 ? "Accelerating" : "Decelerating"})</p>
        </div>
        
        <div className="output-container overshoot-container">
          <h3 className="explanation-title">{startSpeed > endSpeed ? "Maximum Undershoot:" : "Maximum Overshoot:"}</h3>
          <p className="text-xl">{maxOvershoot.toFixed(2)} km/h</p>
          <p className="text-lg">
            ({calculatePercentage()}% of {startSpeed > endSpeed ? "start" : "end"} speed)
          </p>
        </div>
        
        <div className="output-container distance-container">
          <h3 className="explanation-title">Distance Travelled:</h3>
          <p className="text-lg">At duration: <strong>{durationDistance.toFixed(2)} m</strong></p>
          <p className="text-lg">At stabilization: <strong>{stabilizationDistance.toFixed(2)} m</strong></p>
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
                yAxisId="left"
                orientation="left"
                domain={[minValue, maxValue]} 
                label={{ value: 'Speed (km/h)', angle: -90, position: 'insideLeft' }}
                tickFormatter={formatYAxis}
              />
              {/* Empty right Y-axis to match the second graph's layout */}
              <YAxis 
                yAxisId="right"
                orientation="right"
                domain={[0, 1]}
                hide={true}
              />
              <Tooltip 
                formatter={formatTooltipValue}
                labelFormatter={(label) => `Time: ${label} ms`}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="actual" 
                stroke="#2563eb" 
                name="Actual Speed (Continuous)" 
                dot={false} 
                strokeWidth={2}
              />
              <Line 
                yAxisId="left"
                type="step" 
                dataKey="received" 
                stroke="#9333ea" 
                name="Received Speed (105ms)" 
                dot={false}
                strokeWidth={2}
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="interpolated" 
                stroke="#10b981" 
                name="Interpolated Speed (20ms)" 
                dot={false}
                strokeWidth={2}
              />
              <ReferenceLine yAxisId="left" y={endSpeed} stroke="red" strokeDasharray="3 3" label="End Speed" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="chart-container">
        <h3 className="chart-title">Distance & Speed Visualization:</h3>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={distanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -5 }} 
              />
              <YAxis 
                yAxisId="left"
                orientation="left"
                label={{ value: 'Distance (m)', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value) => value.toFixed(1)}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                domain={[minValue, maxValue]} 
                label={{ value: 'Speed (km/h)', angle: 90, position: 'insideRight' }}
                tickFormatter={formatYAxis}
              />
              <Tooltip 
                formatter={formatTooltipValue}
                labelFormatter={(label) => `Time: ${label} ms`}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="distance" 
                stroke="#dc2626" 
                name="Distance (m)" 
                dot={false} 
                strokeWidth={2}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="interpolatedSpeed" 
                stroke="#10b981" 
                name="Interpolated Speed (km/h)" 
                dot={false} 
                strokeWidth={2}
              />
              <ReferenceLine yAxisId="left" x={duration} stroke="#6b7280" strokeDasharray="3 3" label="Duration End" />
              {stabilizationDistance > 0 && (
                <ReferenceLine 
                  yAxisId="left" 
                  x={distanceData.find(d => Math.abs(d.distance - stabilizationDistance) < 0.01)?.time} 
                  stroke="#9333ea" 
                  strokeDasharray="3 3" 
                  label="Stabilization"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="test-environment-container">
            <h3 className="test-environment-title">Values for Test Environment:</h3>
            <div className="jerk-values-grid">
              <div className="jerk-value-container">
                <span className="jerk-value-label">jerk_a_m_per_s3:</span>
                <span className="jerk-value">{physicalJerkA.toFixed(4)} m/s³</span>
              </div>
              <div className="jerk-value-container">
                <span className="jerk-value-label">jerk_b_m_per_s3:</span>
                <span className="jerk-value">{physicalJerkB.toFixed(4)} m/s³</span>
              </div>
            </div>
            <div className="test-environment-code">
              <pre>
                {`mov_accelerated_jerk_t::init(
  ${(startSpeed/3.6).toFixed(2)},  // initial_speed_m_per_s
  ${(duration/1000).toFixed(3)},  // duration_s
  ${(endSpeed/3.6).toFixed(2)},  // target_speed_m_per_s
  ${physicalJerkA.toFixed(4)},  // jerk_a_m_per_s3
  ${physicalJerkB.toFixed(4)}   // jerk_b_m_per_s3
);`}
              </pre>
            </div>
          </div>
      
      <div className="explanation-container">
        <h3 className="explanation-title">Explanation:</h3>
        <p>This tool simulates a system where speed data is sent every 105ms but needed every 20ms:</p>
        <ul className="explanation-list">
          <li>The <span className="text-blue font-medium">blue line</span> shows the continuous/ideal speed over time {useJerk ? "with jerk factors applied (S-curve)" : "(linear)"}</li>
          <li>The <span className="text-purple font-medium">purple line</span> shows the actual speed values received every 105ms (step function)</li>
          <li>The <span className="text-green font-medium">green line</span> shows the interpolated speed using linear regression based on the two most recent received points</li>
          <li>The <span className="text-red font-medium">red line</span> in the second chart shows the distance traveled over time</li>
          <li>The gray vertical line marks the end of the actual acceleration/deceleration period</li>
          <li>The purple vertical line marks when interpolated speed stabilizes to the end speed</li>
          <li>
            {startSpeed > endSpeed ? 
              "Maximum undershoot occurs when the interpolation drops below the final target speed" : 
              "Maximum overshoot occurs when the interpolation exceeds the final target speed"}
          </li>
          {useJerk && (
            <>
              <li><strong>Jerk factors</strong> control the shape of the speed curve:</li>
              <li>Low initial jerk values (closer to 0) create a sharper initial acceleration</li>
              <li>Low final jerk values (closer to 0) create a sharper approach to the end speed</li>
              <li>Higher jerk values (closer to 1) create more gradual, smoother transitions</li>
              <li>The corresponding physical jerk values for your test environment are calculated and displayed above</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

export default App;