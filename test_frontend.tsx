import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { generateTagsForBatch } from './aiService';

const App = () => {
  const [log, setLog] = useState<string>('Ready.');

  const runTest = async () => {
    try {
      setLog('Running test...');
      const req = await fetch('test_image_1778213003892.png');
      const blob = await req.blob();
      const file = new File([blob], 'test.png', { type: 'image/png' });
      const result = await generateTagsForBatch([{ id: '1', file }]);
      setLog('Success: ' + JSON.stringify(result));
    } catch (e: any) {
      setLog('Error: ' + e.message + '\n' + e.stack);
    }
  };

  return (
    <div>
      <button id="run-ai-btn" onClick={runTest}>Run AI Test</button>
      <pre id="test-log">{log}</pre>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
