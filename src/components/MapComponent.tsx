import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ItineraryItem {
  id: string;
  title: string;
  description: string;
  time: string;
  location: string;
  coordinates: [number, number];
  category: 'activity' | 'meal' | 'transport' | 'accommodation';
}

interface MapComponentProps {
  items: ItineraryItem[];
  showDirections?: boolean;
  userLocation?: [number, number];
  onSelectLocation?: (coords: [number, number]) => void;
}


export default function MapComponent({ items, showDirections, userLocation, onSelectLocation }: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const selectionMarkerRef = useRef<L.Marker | null>(null);
  const routeOriginRef = useRef<L.LatLng | null>(null);
  const routeDestRef = useRef<L.LatLng | null>(null);
  const contextPopupRef = useRef<L.Popup | null>(null);

useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map if it doesn't exist
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([-20.348404, 57.552152], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;

    // Remove existing routing control if any
    if (routingControlRef.current) {
      try {
        map?.removeControl(routingControlRef.current);
      } catch (e) {
        // ignore
      }
      routingControlRef.current = null;
    }

    // Clear existing markers (keep tiles and other layers)
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // Map click to select a location
    let clickHandler: any = null;
    if (onSelectLocation) {
      clickHandler = (e: any) => {
        const coords: [number, number] = [e.latlng.lat, e.latlng.lng];
        if (selectionMarkerRef.current) {
          selectionMarkerRef.current.setLatLng(e.latlng);
        } else {
          selectionMarkerRef.current = L.marker(coords).addTo(map);
        }
        onSelectLocation(coords);
      };
      map.on('click', clickHandler);
    }

    // Add markers for each item
    const markers: L.Marker[] = [];
    items.forEach((item, index) => {
      const categoryColorVar: Record<ItineraryItem['category'], string> = {
        activity: '--primary',
        meal: '--secondary',
        transport: '--palm-green',
        accommodation: '--ocean-deep',
      };

      const customIcon = L.divIcon({
        html: `
          <div style="
            background-color: hsl(var(${categoryColorVar[item.category]}));
            color: white;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          ">
            ${index + 1}
          </div>
        `,
        className: 'custom-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const color = `hsl(var(${categoryColorVar[item.category]}))`;
      const marker = L.marker(item.coordinates, { icon: customIcon })
        .bindPopup(`
          <div style="min-width: 220px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <strong style="color: ${color};">${item.time}</strong>
            </div>
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold;">${item.title}</h3>
            <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">${item.description}</p>
            <div style="display: flex; align-items: center; gap: 4px; color: #888; font-size: 12px;">
              📍 ${item.location}
            </div>
          </div>
        `)
        .addTo(map);

      markers.push(marker);
    });

    // Fit map to show all markers
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }

    // Right-click context menu for directions
    const buildRoute = (from: L.LatLng, to: L.LatLng) => {
      if (!map) return;
      if (routingControlRef.current) {
        try { map.removeControl(routingControlRef.current); } catch {}
      }
      const routingControl = (L as any).Routing.control({
        waypoints: [from, to],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        show: false,
        createMarker: () => null,
      }).addTo(map);
      routingControlRef.current = routingControl;
    };

    const contextHandler = (e: L.LeafletMouseEvent) => {
      const container = L.DomUtil.create('div', 'leaflet-context-menu');
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button id="dir-here" style="padding:6px 8px; border-radius:6px; background:hsl(var(--muted)); border:1px solid hsl(var(--border)); cursor:pointer;">Direction here</button>
          <button id="dir-to" style="padding:6px 8px; border-radius:6px; background:hsl(var(--muted)); border:1px solid hsl(var(--border)); cursor:pointer;">Direction to</button>
        </div>
      `;
      const popup = L.popup({ closeButton: true })
        .setLatLng(e.latlng)
        .setContent(container);
      contextPopupRef.current = popup;
      popup.openOn(map);

      const fromBtn = container.querySelector('#dir-here') as HTMLButtonElement | null;
      const toBtn = container.querySelector('#dir-to') as HTMLButtonElement | null;

      fromBtn?.addEventListener('click', () => {
        routeOriginRef.current = e.latlng;
        if (routeDestRef.current) buildRoute(routeOriginRef.current, routeDestRef.current);
        map.closePopup(popup);
      });

      toBtn?.addEventListener('click', () => {
        routeDestRef.current = e.latlng;
        // If no origin, default to user location if available
        if (!routeOriginRef.current && userLocation) {
          routeOriginRef.current = L.latLng(userLocation[0], userLocation[1]);
        }
        if (routeOriginRef.current) buildRoute(routeOriginRef.current, routeDestRef.current);
        map.closePopup(popup);
      });
    };

    map.on('contextmenu', contextHandler);

    // Draw directions from user location through the day's waypoints (default)
    if (!routeOriginRef.current && !routeDestRef.current && showDirections && userLocation) {
      const waypoints = [
        L.latLng(userLocation[0], userLocation[1]),
        ...items.map((it) => L.latLng(it.coordinates[0], it.coordinates[1]))
      ];

      if (waypoints.length >= 2) {
        const routingControl = (L as any).Routing.control({
          waypoints,
          routeWhileDragging: false,
          addWaypoints: false,
          draggableWaypoints: false,
          show: false,
          createMarker: () => null,
        }).addTo(map);
        routingControlRef.current = routingControl;
      }
    }

    // Cleanup function
    return () => {
      if (clickHandler) {
        map.off('click', clickHandler);
      }
      map.off('contextmenu', contextHandler);
      if (routingControlRef.current) {
        try {
          map.removeControl(routingControlRef.current);
        } catch (e) {
          // ignore
        }
        routingControlRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [items, showDirections, userLocation, onSelectLocation]);


  return (
    <div 
      ref={mapRef} 
      className="w-full h-full rounded-lg"
      style={{ minHeight: '400px' }}
    />
  );
}