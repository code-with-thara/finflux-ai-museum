import React, { useRef, useState } from 'react';

export default function SplashVideo({ onFinish }) {
  const videoRef = useRef(null);
  const [fadingOut, setFadingOut] = useState(false);

  const finish = () => {
    setFadingOut(true);
    // let the fade transition play before unmounting
    setTimeout(onFinish, 400);
  };

  const handleSkip = () => {
    if (videoRef.current) videoRef.current.pause();
    finish();
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center transition-opacity duration-400 ${
        fadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <video
        ref={videoRef}
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
        className="w-full h-full object-contain"
      />

      <button
        type="button"
        onClick={handleSkip}
        className="absolute bottom-6 right-6 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/30 backdrop-blur-sm transition-colors"
      >
        Skip
      </button>
    </div>
  );
}
