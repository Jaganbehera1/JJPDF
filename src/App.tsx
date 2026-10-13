import { useState } from 'react';
import LandingPage from '@/components/LandingPage';
import Editor from '@/components/editor/Editor';

function App() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  if (uploadedFile) {
    return <Editor file={uploadedFile} onBack={() => setUploadedFile(null)} />;
  }

  return <LandingPage onUpload={setUploadedFile} />;
}

export default App;
