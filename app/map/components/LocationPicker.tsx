'use client';
import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LocationPickerProps {
  onLocationSelect: (coords: { lat: number; lng: number }) => void;
}

export default function LocationPicker({ onLocationSelect }: LocationPickerProps) {
  // Defaults to Katherine, NT
  const [marker, setMarker] = useState({ lat: -14.46, lng: 132.26 });
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markerInstance = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_KEY || '';

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [marker.lng, marker.lat],
      zoom: 6
    });

    mapInstance.current = map;

    // Create a draggable native Mapbox marker
    const mk = new mapboxgl.Marker({ draggable: true })
      .setLngLat([marker.lng, marker.lat])
      .addTo(map);

    markerInstance.current = mk;

    // Handle marker drag end
    mk.on('dragend', () => {
      const lngLat = mk.getLngLat();
      const newCoords = { lat: lngLat.lat, lng: lngLat.lng };
      setMarker(newCoords);
      onLocationSelect(newCoords);
    });

    // Option 1: Map-Clicking Interface
    map.on('click', (e: mapboxgl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      const newCoords = { lat, lng };
      setMarker(newCoords);
      mk.setLngLat([lng, lat]);
      onLocationSelect(newCoords);
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Option 2: Manual Entry
  const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const parsed = parseFloat(value) || 0;
    const newMarker = { ...marker, [name]: parsed };
    setMarker(newMarker);
    onLocationSelect(newMarker);

    // Update map view and pin position when typing coordinates manually
    if (markerInstance.current && mapInstance.current) {
      markerInstance.current.setLngLat([newMarker.lng, newMarker.lat]);
      mapInstance.current.jumpTo({ center: [newMarker.lng, newMarker.lat] });
    }
  };

  return (
    <div className="space-y-4">
      {/* Manual Input Fields */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-sm text-white/70 mb-1 block">Latitude</label>
          <input 
            type="number" 
            name="lat" 
            value={marker.lat} 
            onChange={handleManualInput} 
            className="input w-full !text-text" 
            step="any" 
          />
        </div>
        <div className="flex-1">
          <label className="text-sm text-white/70 mb-1 block">Longitude</label>
          <input 
            type="number" 
            name="lng" 
            value={marker.lng} 
            onChange={handleManualInput} 
            className="input w-full !text-text" 
            step="any" 
          />
        </div>
      </div>

      {/* Visual Map Interface */}
      <div className="h-64 rounded border border-white/10 overflow-hidden relative">
        <div ref={mapContainer} className="w-full h-full cursor-crosshair" />
      </div>
      <p className="text-xs text-white/50">Click the map or drag the pin, or enter exact GPS coordinates manually.</p>
    </div>
  );
}