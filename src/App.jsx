import React, { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { Icons } from './components/Icons';
import { solveHomography, calculateResults } from './utils/mathUtils';
import { generateAIRender } from './utils/aiService';
import { cabinets, standardPitches, defaultImages } from './constants/data';

const App = () => {
    const [mode, setMode] = useState('calc');
    // HESAPLAMA STATE
    const [targetWidth, setTargetWidth] = useState(5);
    const [targetHeight, setTargetHeight] = useState(3);
    const [viewDistance, setViewDistance] = useState(5);
    const [selectedCabinetId, setSelectedCabinetId] = useState('500x500');
    const [selectedPitch, setSelectedPitch] = useState(3.91);
    const [bestFit, setBestFit] = useState(null);

    // SIM STATE
    const [image, setImage] = useState(null);
    const [points, setPoints] = useState([]);
    const [activePoint, setActivePoint] = useState(null);
    const [simWidthInput, setSimWidthInput] = useState(5);
    const [matrix3d, setMatrix3d] = useState('');
    const [isRenderMode, setIsRenderMode] = useState(false);

    // AI STATE
    const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
    const [tempApiKey, setTempApiKey] = useState('');
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [aiImage, setAiImage] = useState(null);

    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const pointsRef = useRef([]);
    const captureRef = useRef(null);

    const calcRes = calculateResults(targetWidth, targetHeight, selectedCabinetId, selectedPitch, cabinets);

    // Akıllı Öneri (Yapay Zeka - Best Fit)
    useEffect(() => {
        if (mode !== 'calc') return;
        let minDeviation = Infinity;
        let recommended = null;
        cabinets.forEach(cab => {
            const res = calculateResults(targetWidth, targetHeight, cab.id, 3.91, cabinets);
            const deviation = Math.abs(targetWidth - res.actualW) + Math.abs(targetHeight - res.actualH);
            if (deviation < minDeviation) { minDeviation = deviation; recommended = { ...cab, ...res }; }
        });
        setBestFit(recommended);
    }, [targetWidth, targetHeight, mode]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                setImage(evt.target.result);
                setIsRenderMode(false);
                setTimeout(() => {
                    resetPoints();
                }, 100);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDefaultImageSelect = (url) => {
        setImage(url);
        setIsRenderMode(false);
        setTimeout(() => {
            resetPoints();
        }, 100);
    };

    const resetPoints = () => {
        if (containerRef.current) {
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            const cx = w / 2, cy = h / 2;

            // Use calculated aspect ratio
            const targetRatio = (calcRes.actualW && calcRes.actualH) ? (calcRes.actualW / calcRes.actualH) : 1;

            // Base size (approx 40% of screen min dimension)
            const baseScale = Math.min(w, h) * 0.25;

            let halfW, halfH;
            if (targetRatio >= 1) {
                // Wider than tall
                halfW = baseScale;
                halfH = baseScale / targetRatio;
            } else {
                // Taller than wide
                halfH = baseScale;
                halfW = baseScale * targetRatio;
            }

            const initialPoints = [
                { x: cx - halfW, y: cy - halfH },
                { x: cx + halfW, y: cy - halfH },
                { x: cx + halfW, y: cy + halfH },
                { x: cx - halfW, y: cy + halfH }
            ];
            setPoints(initialPoints);
            pointsRef.current = initialPoints;
        }
    };

    useEffect(() => {
        const handleWindowMove = (e) => {
            if (activePoint === null || !containerRef.current || isRenderMode) return;
            if (e.cancelable) e.preventDefault();
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            const rect = containerRef.current.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const newPoints = [...pointsRef.current];
            newPoints[activePoint] = { x, y };
            setPoints(newPoints);
            pointsRef.current = newPoints;
        };
        const handleWindowUp = () => setActivePoint(null);
        if (activePoint !== null) {
            window.addEventListener('mousemove', handleWindowMove);
            window.addEventListener('touchmove', handleWindowMove, { passive: false });
            window.addEventListener('mouseup', handleWindowUp);
            window.addEventListener('touchend', handleWindowUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleWindowMove);
            window.removeEventListener('touchmove', handleWindowMove);
            window.removeEventListener('mouseup', handleWindowUp);
            window.removeEventListener('touchend', handleWindowUp);
        };
    }, [activePoint, isRenderMode]);

    const handleStart = (index, e) => {
        if (isRenderMode) return;
        if (e.type === 'touchstart' && e.cancelable) e.preventDefault();
        setActivePoint(index);
        pointsRef.current = points;
    };

    useEffect(() => {
        if (!image || points.length === 0) return;
        const W = 300, H = 200;
        const src = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
        const m = solveHomography(src, points);
        setMatrix3d(`matrix3d(${m.join(',')})`);
    }, [points, image]);

    const simResults = (image && points.length > 0) ? (() => {
        const pxWidth = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        const pxHeight = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
        const aspectRatio = pxHeight / pxWidth;
        return calculateResults(simWidthInput, simWidthInput * aspectRatio, selectedCabinetId, selectedPitch, cabinets);
    })() : null;

    const getMagnifierStyle = () => {
        if (activePoint === null || !imgRef.current || !containerRef.current) return {};
        const imgRect = imgRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const imgOffsetX = imgRect.left - containerRect.left;
        const imgOffsetY = imgRect.top - containerRect.top;
        const p = points[activePoint];
        const zoom = 2.5;
        const bgPosX = -((p.x - imgOffsetX) * zoom) + 60;
        const bgPosY = -((p.y - imgOffsetY) * zoom) + 60;
        return {
            left: p.x - 60, top: p.y - 140,
            backgroundImage: `url(${image})`,
            backgroundSize: `${imgRect.width * zoom}px ${imgRect.height * zoom}px`,
            backgroundPosition: `${bgPosX}px ${bgPosY}px`
        };
    };

    const handleDownload = async () => {
        if (captureRef.current) {
            try {
                const dataUrl = await toPng(captureRef.current, { cacheBust: true, pixelRatio: 2 });
                const link = document.createElement('a');
                link.download = 'led-simulasyon.png';
                link.href = dataUrl;
                link.click();
            } catch (err) {
                console.error("Download failed:", err);
                alert("Görüntü indirilemedi.");
            }
        }
    };

    const handleAiRender = async () => {
        if (!apiKey) {
            setTempApiKey('');
            setShowApiKeyModal(true);
            return;
        }
        if (!captureRef.current) return;

        setIsAiLoading(true);
        setAiResult(null);
        setAiImage(null);

        try {
            const dataUrl = await toPng(captureRef.current, { cacheBust: true, pixelRatio: 1 });
            const prompt = `TASK: Enhance this architectural photograph by integrating a professional direct-view LED screen installation.

⚠️ CRITICAL LOCATION CONSTRAINT - HIGHEST PRIORITY:
- There is a DARK/BLACK RECTANGULAR AREA in the image - this is the LED screen placeholder
- Place the LED screen ONLY in this exact marked area
- DO NOT add LED screens to any other buildings, walls, or surfaces in the image
- The LED screen must fit EXACTLY within the boundaries of the marked dark rectangle
- If you see multiple buildings or structures, ONLY modify the one with the marked dark area
- DO NOT create LED screens on unmarked buildings or surfaces

CRITICAL RULES - DO NOT VIOLATE:
1. PRESERVE the exact composition - do NOT move, add, or remove any objects, people, or architectural elements
2. PRESERVE the original perspective and camera angle
3. ONLY modify: The marked LED screen area, reflections on glass surfaces, color grading, and image quality
4. Keep all existing elements in their EXACT original positions

LED SCREEN SPECIFICATIONS:
- Direct-view LED (dvLED) display with matte, non-reflective surface
- High brightness (>5000 nits) for outdoor visibility
- Visible pixel pitch texture (P3.91 or similar)
- NO bezels, seamless modular panels
- Deep blacks, vibrant colors, high contrast
- Screen status: ${isRenderMode ? 'displaying vibrant advertising content' : 'powered off (solid black)'}

ENHANCEMENTS TO APPLY:
✓ Integrate the LED screen naturally into the marked area ONLY
✓ Add realistic reflections of the LED screen on nearby glass/reflective surfaces
✓ Professional color grading (enhance contrast, saturation, white balance)
✓ Improve image sharpness and clarity
✓ Professional photography post-processing (like shot with a high-end DSLR)
✓ Natural lighting adjustments to match the LED screen brightness

FORBIDDEN CHANGES:
✗ Do NOT change object positions or layout
✗ Do NOT add new objects (except LED screen in marked area and its reflections)
✗ Do NOT remove existing elements
✗ Do NOT alter the architectural structure
✗ Do NOT change the perspective or composition
✗ Do NOT add LED screens to unmarked areas or other buildings

Output: A photorealistic, professionally enhanced architectural photograph with LED screen ONLY in the marked area.`;

            const result = await generateAIRender(apiKey, dataUrl, prompt);
            if (result.success) {
                if (result.image) {
                    setAiImage(result.image);
                    setAiResult("Görsel başarıyla oluşturuldu.");
                } else {
                    setAiResult(result.text);
                }
            } else {
                alert("AI Hatası: " + result.error);
            }
        } catch (err) {
            console.error(err);
            alert("Bir hata oluştu.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const saveApiKey = (key) => {
        localStorage.setItem('gemini_api_key', key);
        setApiKey(key);
        setShowApiKeyModal(false);
    };

    const handleDimensionChange = (setter) => (e) => {
        const val = Number(e.target.value);
        if (val > 0) setter(val);
    };

    const handleSwitchToSim = () => {
        setMode('sim');
        setIsRenderMode(false);
        setSimWidthInput(calcRes.actualW);

        // Update aspect ratio of existing points if they exist
        if (points.length === 4) {
            const p = points;
            const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4;
            const cy = (p[0].y + p[1].y + p[2].y + p[3].y) / 4;

            // Current width in pixels (approx)
            const currentPxW = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);

            // Calculate new height in pixels based on calculated aspect ratio
            const targetRatio = (calcRes.actualW && calcRes.actualH) ? (calcRes.actualH / calcRes.actualW) : 1;
            const newPxH = currentPxW * targetRatio;

            const halfW = currentPxW / 2;
            const halfH = newPxH / 2;

            // Assume axis-aligned for simplicity during reset/update, 
            // or we could try to preserve rotation, but usually it's axis aligned initially.
            // A simple axis-aligned box centered at old center is safe enough for "reset to dims".
            const newPoints = [
                { x: cx - halfW, y: cy - halfH },
                { x: cx + halfW, y: cy - halfH },
                { x: cx + halfW, y: cy + halfH },
                { x: cx - halfW, y: cy + halfH }
            ];

            setPoints(newPoints);
            pointsRef.current = newPoints;
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-slate-100 font-sans flex flex-col select-none touch-none overflow-hidden"
            style={{ backgroundColor: '#020617' }}>

            {/* API KEY MODAL */}
            {showApiKeyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-md w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Google Gemini API Key</h3>
                        <p className="text-xs text-slate-400 mb-4">AI özelliklerini kullanmak için API anahtarınızı girin. Anahtarınız sadece tarayıcınızda saklanır.</p>
                        <input type="password" placeholder="AIzaSy..." value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white mb-4 focus:border-indigo-500 focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(tempApiKey) }} />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowApiKeyModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">İptal</button>
                            <button onClick={() => saveApiKey(tempApiKey)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500">Kaydet</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI RESULT MODAL */}
            {(aiResult || aiImage) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-4xl w-full shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Icons.Magic /> AI Render</h3>
                            <button onClick={() => { setAiResult(null); setAiImage(null); }} className="text-slate-400 hover:text-white"><Icons.Trash /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col items-center justify-center">
                            {aiImage ? (
                                <img src={aiImage} alt="AI Render" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                            ) : (
                                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono w-full">
                                    {aiResult}
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            {aiImage && (
                                <a href={aiImage} download="ai-render.png" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 flex items-center gap-2">
                                    <Icons.Download /> İndir
                                </a>
                            )}
                            <button onClick={() => { setAiResult(null); setAiImage(null); }} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700">Kapat</button>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER */}
            <div className={`bg-slate-900 shadow-xl border-b border-slate-800 p-3 flex justify-between items-center shrink-0 z-50 transition-opacity duration-300 ${isRenderMode ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <div className="font-bold text-lg flex items-center gap-2">
                    <span className="bg-indigo-600 px-1.5 py-0.5 rounded text-white text-xs tracking-wider">LED</span>
                    <span className="text-sm sm:text-base">Proje Asistanı</span>
                </div>
                <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
                    <button onClick={() => { setTempApiKey(apiKey); setShowApiKeyModal(true); }} className="px-3 py-1.5 rounded-md text-xs font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1" title="API Anahtarını Değiştir">
                        <Icons.Key />
                    </button>
                    <div className="w-px bg-slate-700 mx-1"></div>
                    <button onClick={() => { setMode('calc'); setIsRenderMode(false); }} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${mode === 'calc' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                        <Icons.Calc /> Hesap
                    </button>
                    <button onClick={handleSwitchToSim} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${mode === 'sim' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>
                        <Icons.Camera /> AR
                    </button>
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">

                {/* MOD 1: DETAYLI HESAPLAMA EKRANI */}
                {mode === 'calc' && (
                    <div className="flex-1 overflow-y-auto p-4 animate-in fade-in" style={{ touchAction: 'pan-y' }}>
                        <div className="max-w-md mx-auto space-y-4 pb-20">

                            {/* 1. ÖLÇÜLER */}
                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <div className="flex justify-between mb-4">
                                    <span className="font-bold text-xs uppercase text-indigo-400">Hedef Boyutlar</span>
                                    {bestFit && selectedCabinetId !== bestFit.id && (
                                        <span onClick={() => setSelectedCabinetId(bestFit.id)} className="text-[10px] bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded cursor-pointer border border-emerald-800 animate-pulse">Öneri: {bestFit.name}</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-[10px] text-slate-500 font-bold mb-1 block">Genişlik (m)</label>
                                        <input type="number" min="0.1" step="0.1" value={targetWidth} onChange={handleDimensionChange(setTargetWidth)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 font-bold mb-1 block">Yükseklik (m)</label>
                                        <input type="number" min="0.1" step="0.1" value={targetHeight} onChange={handleDimensionChange(setTargetHeight)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono focus:border-indigo-500 focus:outline-none" />
                                    </div>
                                </div>

                                {/* İZLEME MESAFESİ */}
                                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs text-slate-400">İzleme Mesafesi: <span className="text-white font-bold">{viewDistance}m</span></span>
                                        <span className="text-[10px] text-emerald-500 bg-emerald-900/30 px-2 py-0.5 rounded">Öneri: P{(viewDistance / 1.5).toFixed(1)}</span>
                                    </div>
                                    <input type="range" min="1" max="50" step="0.5" value={viewDistance} onChange={(e) => setViewDistance(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                </div>
                            </div>

                            {/* 2. DONANIM */}
                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-3">
                                <label className="text-[10px] text-slate-500 font-bold block">Kasa Tipi</label>
                                <select value={selectedCabinetId} onChange={(e) => setSelectedCabinetId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none">{cabinets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                <label className="text-[10px] text-slate-500 font-bold block">Piksel (Pitch)</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">{standardPitches.map(p => (<button key={p} onClick={() => setSelectedPitch(p)} className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-bold border ${selectedPitch === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>P{p}</button>))}</div>
                            </div>

                            {/* 3. SONUÇ RAPORU */}
                            <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden">
                                <div className="p-5 text-center border-b border-slate-800">
                                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Çözünürlük</div>
                                    <div className="text-3xl font-black text-white font-mono">{calcRes.resW} x {calcRes.resH}</div>
                                    <div className="text-xs text-indigo-400 mt-2">Gerçek Boyut: {calcRes.actualW.toFixed(2)}m x {calcRes.actualH.toFixed(2)}m</div>
                                </div>

                                <div className="grid grid-cols-3 divide-x divide-slate-800 bg-slate-900/50">
                                    <div className="p-3 text-center">
                                        <div className="flex justify-center text-amber-500 mb-1"><Icons.Bolt /></div>
                                        <div className="text-[9px] text-slate-500 uppercase">Max Güç</div>
                                        <div className="text-sm font-bold text-slate-200">{calcRes.totalMaxPowerKW.toFixed(1)} kW</div>
                                    </div>
                                    <div className="p-3 text-center">
                                        <div className="flex justify-center text-emerald-500 mb-1"><Icons.Bolt /></div>
                                        <div className="text-[9px] text-slate-500 uppercase">Ort. Güç</div>
                                        <div className="text-sm font-bold text-slate-200">{calcRes.totalAvgPowerKW.toFixed(1)} kW</div>
                                    </div>
                                    <div className="p-3 text-center">
                                        <div className="flex justify-center text-blue-500 mb-1"><Icons.Weight /></div>
                                        <div className="text-[9px] text-slate-500 uppercase">Ağırlık</div>
                                        <div className="text-sm font-bold text-slate-200">~{calcRes.totalWeight} kg</div>
                                    </div>
                                </div>
                                <div className="bg-slate-950 p-2 text-center text-[10px] text-slate-500">
                                    Toplam {calcRes.totalCabinets} adet kabinet ({calcRes.cols}x{calcRes.rows})
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* MOD 2: SİMÜLASYON */}
                {mode === 'sim' && (
                    <div className="flex-1 flex flex-col bg-black relative min-h-0">
                        <div className={`p-2 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex gap-2 items-center overflow-x-auto shrink-0 z-30 transition-all duration-300 ${isRenderMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                            <label className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer hover:bg-indigo-500 shadow-lg">
                                <Icons.Upload /> {image ? 'Değiştir' : 'Fotoğraf'}
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                            </label>
                            {image && (
                                <>
                                    <div className="flex items-center gap-2 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
                                        <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">Ref(m):</span>
                                        <input type="number" min="0.1" value={simWidthInput} onChange={handleDimensionChange(setSimWidthInput)} className="w-10 bg-slate-900 text-white text-sm font-bold p-1 rounded text-center focus:outline-none border border-slate-600" />
                                    </div>
                                    <button onClick={resetPoints} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700" title="Noktaları Sıfırla">
                                        <Icons.Refresh />
                                    </button>
                                    <button onClick={() => setImage(null)} className="p-2 bg-red-900/50 text-red-400 rounded-lg hover:bg-red-900/70">
                                        <Icons.Trash />
                                    </button>
                                </>
                            )}
                        </div>

                        <div ref={containerRef} className="flex-1 relative w-full h-full flex items-center justify-center bg-black cursor-crosshair overflow-hidden" style={{ touchAction: 'none' }}>
                            {!image ? (
                                <div className="text-center text-slate-600 p-4 max-w-lg">
                                    <div className="bg-slate-900 inline-block p-6 rounded-full mb-4 animate-pulse"><Icons.Camera /></div>
                                    <p className="text-sm font-medium mb-6">Başlamak için fotoğraf yükleyin veya aşağıdan seçin</p>

                                    <div className="grid grid-cols-3 gap-3">
                                        {defaultImages.map(img => (
                                            <button key={img.id} onClick={() => handleDefaultImageSelect(img.url)} className="group relative aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-indigo-500 transition-all">
                                                <img src={img.url} alt={img.label} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] text-white font-bold">{img.label}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div ref={captureRef} className="relative w-full h-full flex items-center justify-center bg-black">
                                    <img ref={imgRef} src={image} alt="Project Area" className="max-w-full max-h-full object-contain pointer-events-none select-none opacity-100" draggable="false" />

                                    {/* 3D LED SCREEN */}
                                    <div className="absolute top-0 left-0 w-[300px] h-[200px] pointer-events-none origin-top-left z-10" style={{ transform: matrix3d, opacity: 1, filter: isRenderMode ? 'brightness(1.1) contrast(1.1)' : 'none' }}>
                                        <div className={`w-full h-full relative overflow-hidden transition-all duration-500 ${isRenderMode ? 'bg-black shadow-[0_0_30px_rgba(0,100,255,0.4)]' : 'bg-black/60 border border-indigo-400'}`}>
                                            {isRenderMode && <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-900 opacity-90"></div>}
                                            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '2px 2px' }}></div>
                                            {simResults && <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, rgba(0,0,0,${isRenderMode ? '0.6' : '0.2'}) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,${isRenderMode ? '0.6' : '0.2'}) 1px, transparent 1px)`, backgroundSize: `${100 / simResults.cols}% ${100 / simResults.rows}%` }}></div>}
                                            {isRenderMode && <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>}
                                            {!isRenderMode && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="bg-black/80 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm border border-white/20 shadow-xl text-center">
                                                        {simResults ? <><span className="text-emerald-400 font-bold">{simResults.resW}x{simResults.resH}</span><br /><span className="text-[8px] opacity-70">{simResults.actualW.toFixed(2)}m x {simResults.actualH.toFixed(2)}m</span></> : '...'}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* INFO OVERLAY (Visible only in Render Mode) */}
                                    {isRenderMode && simResults && (
                                        <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl z-50 max-w-xs text-left">
                                            <div className="flex items-center gap-2 mb-3 border-b border-slate-700 pb-2">
                                                <span className="bg-indigo-600 w-2 h-6 rounded-sm"></span>
                                                <div>
                                                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Proje Özeti</div>
                                                    <div className="text-sm font-bold text-white">{simResults.cab.name}</div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                                <div>
                                                    <div className="text-slate-500">Boyutlar</div>
                                                    <div className="font-mono text-white">{simResults.actualW.toFixed(2)}m x {simResults.actualH.toFixed(2)}m</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500">Çözünürlük</div>
                                                    <div className="font-mono text-white">{simResults.resW} x {simResults.resH} px</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500">Toplam Güç (Max)</div>
                                                    <div className="font-mono text-white">{simResults.totalMaxPowerKW.toFixed(1)} kW</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500">Ağırlık</div>
                                                    <div className="font-mono text-white">~{simResults.totalWeight} kg</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {!isRenderMode && points.map((p, i) => (
                                        <div key={i} className={`absolute w-12 h-12 -ml-6 -mt-6 flex items-center justify-center z-20 cursor-move ${activePoint === i ? 'scale-110 z-30' : ''}`} style={{ left: p.x, top: p.y, touchAction: 'none' }} onMouseDown={(e) => handleStart(i, e)} onTouchStart={(e) => handleStart(i, e)}>
                                            <div className={`w-4 h-4 rounded-full border-2 shadow-sm ${activePoint === i ? 'bg-indigo-500 border-white' : 'bg-white/30 border-white backdrop-blur-md'}`}></div>
                                        </div>
                                    ))}
                                    {!isRenderMode && activePoint !== null && (
                                        <div className="absolute z-50 pointer-events-none border-2 border-white rounded-full overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black" style={{ width: '120px', height: '120px', ...getMagnifierStyle() }}>
                                            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-red-500/50"></div>
                                            <div className="absolute left-1/2 top-0 h-full w-[1px] bg-red-500/50"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-900/80 backdrop-blur-sm border-t border-slate-800 flex justify-center shrink-0 z-50 gap-2">
                            {image ? (
                                <>
                                    <button onClick={() => setIsRenderMode(!isRenderMode)} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-2xl transition-all scale-100 active:scale-95 border flex-1 justify-center max-w-xs ${isRenderMode ? 'bg-slate-700 text-white border-slate-500' : 'bg-indigo-600 text-white border-indigo-400 hover:bg-indigo-500'}`}>
                                        {isRenderMode ? <><Icons.Edit /> DÜZENLE</> : <><Icons.Magic /> RENDER</>}
                                    </button>
                                    {isRenderMode && (
                                        <>
                                            <button onClick={handleAiRender} disabled={isAiLoading} className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold shadow-2xl transition-all scale-100 active:scale-95 border border-purple-400 hover:bg-purple-500 ${isAiLoading ? 'bg-purple-800 text-slate-400' : 'bg-purple-600 text-white'}`}>
                                                {isAiLoading ? '...' : <Icons.Magic />} AI
                                            </button>
                                            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold shadow-2xl transition-all scale-100 active:scale-95 border bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500">
                                                <Icons.Download />
                                            </button>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div className="text-xs text-slate-500">Görüntüleme için fotoğraf bekleniyor...</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
