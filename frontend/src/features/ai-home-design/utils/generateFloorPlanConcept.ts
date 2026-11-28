
import type { HomeDesignRequirements } from "../types/design.types";

export interface ConceptRoom {
  name: string;
  note: string;
  zone: "public" | "private" | "service" | "circulation";
}

export interface ConceptFloor {
  title: string;
  subtitle: string;
  rooms: ConceptRoom[];
}

export interface FloorPlanConcept {
  title: string;
  plotAreaSqFt: number;
  plotDimensions: string;
  facing: string;
  floors: ConceptFloor[];
  limitations: string[];
}

function room(name: string, note: string, zone: ConceptRoom["zone"]): ConceptRoom {
  return { name, note, zone };
}

/**
 * Produces a preliminary room-adjacency concept, not an architectural drawing.
 * No setbacks, structural grid, local DCR, or room dimensions are inferred.
 */
export function generateFloorPlanConcept(
  requirements: HomeDesignRequirements,
  plotAreaSqFt: number,
): FloorPlanConcept {
  const bhkMatch = requirements.configuration.match(/\d+/);
  const bedrooms = bhkMatch ? Math.max(1, Math.min(5, Number(bhkMatch[0]))) : 2;
  const floorCount = Math.max(1, Math.min(4, Number(requirements.floors) || 1));
  const dims = `${requirements.plotLength} × ${requirements.plotWidth} ${requirements.unit}`;

  const groundRooms: ConceptRoom[] = [
    room("Sit-out / Entry", "Arrival space", "circulation"),
    room("Living", "Main family and guest space", "public"),
    room("Dining", "Connected to living and kitchen", "public"),
    room("Kitchen", "Service zone; utility access to be planned", "service"),
  ];

  if (requirements.parking) {
    groundRooms.unshift(room("Parking", "Vehicle bay; verify gate and turning clearance", "service"));
  }

  groundRooms.push(room("Bedroom 1", "Ground-floor bedroom", "private"));
  groundRooms.push(room("Common toilet", "Position subject to plumbing and ventilation", "service"));
  groundRooms.push(room("Staircase", "Vertical circulation; final stair geometry required", "circulation"));

  const upperRooms: ConceptRoom[] = [
    room("Family lounge", "Shared upper-floor space", "public"),
    room("Bedroom 2", "Private bedroom", "private"),
  ];

  for (let i = 3; i <= bedrooms; i += 1) {
    upperRooms.push(room(`Bedroom ${i}`, "Private bedroom", "private"));
  }

  upperRooms.push(room("Bathroom", "Locate near plumbing stack where practical", "service"));
  upperRooms.push(room("Balcony / Terrace", "Outdoor space, subject to permissible projections", "circulation"));

  const floors: ConceptFloor[] = [{
    title: "Ground floor",
    subtitle: "Suggested public, service and one-bedroom arrangement",
    rooms: groundRooms,
  }];

  if (floorCount > 1) {
    floors.push({
      title: "First floor",
      subtitle: "Suggested private family zone",
      rooms: upperRooms,
    });
  }

  for (let level = 2; level < floorCount; level += 1) {
    floors.push({
      title: level === 2 ? "Second floor" : `Floor ${level + 1}`,
      subtitle: "Flexible additional floor; room mix requires design review",
      rooms: [
        room("Multipurpose room", "Can be adapted to the household brief", "public"),
        room("Bedroom", "Optional private room", "private"),
        room("Bathroom", "Subject to plumbing and ventilation", "service"),
        room("Open terrace", "Confirm permissible terrace and parapet design", "circulation"),
      ],
    });
  }

  const limitations = [
    "This is a room-adjacency concept only, not a dimensioned or construction-ready floor plan.",
    "Plot setbacks, road width, access, north direction, local development-control rules and permissible FSI are not yet applied.",
    "Room sizes, door and window positions, ventilation, structure, staircase geometry and plumbing must be designed and checked by a qualified architect.",
  ];

  if (requirements.plotShape === "irregular") {
    limitations.unshift("The plot is marked irregular; the entered length × width area is only an approximation. A measured site survey and boundary drawing are essential.");
  }

  if (requirements.vastuPreference) {
    limitations.push("Vastu preference is noted, but directional room placement has not been validated in this preliminary concept.");
  }

  return {
    title: `${requirements.configuration} home concept`,
    plotAreaSqFt,
    plotDimensions: dims,
    facing: requirements.facing,
    floors,
    limitations,
  };
}
