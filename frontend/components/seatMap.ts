// components/seatMap.ts
export interface Seat {
  id: string;
  row: number;
  column: number;
  number: string;
  class: 'economy' | 'business' | 'premium' | 'first';
  status: 'available' | 'booked' | 'selected' | 'blocked';
  price: number;
  position?: { x: number; y: number }; // For custom positioning
}

export interface VehicleLayout {
  type: 'bus' | 'train' | 'plane';
  rows: number;
  columns: number;
  seatConfiguration: {
    seatsPerRow: number;
    aislePositions: number[]; // Column indices where aisles should be placed
    sectionBreaks?: number[]; // Row indices where section breaks occur
  };
  classAreas: {
    [className: string]: {
      startRow: number;
      endRow: number;
      startCol?: number;
      endCol?: number;
    };
  };
}

export interface SeatMapOptions {
  container: HTMLElement;
  seats: Seat[][];
  vehicleLayout: VehicleLayout;
  onSeatSelect?: (seat: Seat) => void;
  onSeatDeselect?: (seat: Seat) => void;
  maxSelection?: number;
  showTooltip?: boolean;
  classPrices?: { [key: string]: number }; // Add pricing information
}

export class SeatMap {
  private container: HTMLElement;
  private options: Required<SeatMapOptions>;
  private selectedSeats: Set<string> = new Set();
  private seatElements: Map<string, HTMLElement> = new Map();
  private tooltip: HTMLElement;
  private selectionInfo!: HTMLElement; // Use definite assignment assertion
  private layout: VehicleLayout;

  constructor(options: SeatMapOptions) {
    this.container = options.container;
    this.layout = options.vehicleLayout;
    this.options = {
      container: options.container,
      seats: options.seats,
      vehicleLayout: options.vehicleLayout,
      onSeatSelect: options.onSeatSelect || (() => {}),
      onSeatDeselect: options.onSeatDeselect || (() => {}),
      maxSelection: options.maxSelection || 4,
      showTooltip: options.showTooltip !== false,
      classPrices: options.classPrices || {} // Initialize with provided prices or empty object
    };

    this.tooltip = this.createTooltip();
    this.render();
    this.attachEventListeners();
  }

  private createTooltip(): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'absolute z-50 hidden bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-lg';
    tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
    tooltip.style.marginTop = '-8px';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  private render(): void {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'seat-map-wrapper bg-gray-50 rounded-lg p-6 max-w-5xl mx-auto';

    // Add vehicle header
    const header = this.createVehicleHeader();
    wrapper.appendChild(header);

    // Add legend
    const legend = this.createLegend();
    wrapper.appendChild(legend);

    // Add seat grid based on vehicle type
    const seatGrid = this.createDynamicSeatGrid();
    wrapper.appendChild(seatGrid);

    // Add selection info
    this.selectionInfo = this.createSelectionInfo();
    wrapper.appendChild(this.selectionInfo);

    // Add clear selection button
    const clearButton = this.createClearButton();
    wrapper.appendChild(clearButton);

    this.container.appendChild(wrapper);
  }

  private createVehicleHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'text-center mb-6';
    
    const typeIcons = {
      bus: '🚌',
      train: '🚆',
      plane: '✈️'
    };

    const typeNames = {
      bus: 'Bus Layout',
      train: 'Train Coach Layout',
      plane: 'Aircraft Cabin Layout'
    };

    header.innerHTML = `
      <div class="flex items-center justify-center gap-3 mb-2">
        <span class="text-3xl">${typeIcons[this.layout.type]}</span>
        <h3 class="text-xl font-bold text-gray-800">${typeNames[this.layout.type]}</h3>
      </div>
      <p class="text-sm text-gray-600">Select your preferred seats</p>
    `;

    return header;
  }

  private createLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'flex flex-wrap justify-center gap-6 mb-6 p-4 bg-white rounded-lg border shadow-sm';

    const legendItems = [
      { status: 'available', color: 'bg-white border-2 border-gray-300', label: 'Available' },
      { status: 'selected', color: 'bg-blue-500 border-2 border-blue-600', label: 'Selected' },
      { status: 'booked', color: 'bg-gray-400 border-2 border-gray-500', label: 'Booked' },
      { status: 'blocked', color: 'bg-red-400 border-2 border-red-500', label: 'Blocked' }
    ];

    legendItems.forEach(item => {
      const legendItem = document.createElement('div');
      legendItem.className = 'flex items-center gap-2';
      legendItem.innerHTML = `
        <div class="w-6 h-6 rounded ${item.color}"></div>
        <span class="text-sm text-gray-700 font-medium">${item.label}</span>
      `;
      legend.appendChild(legendItem);
    });

    return legend;
  }

  private createDynamicSeatGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'seat-grid bg-white rounded-lg p-6 border shadow-sm overflow-x-auto';

    switch (this.layout.type) {
      case 'bus':
        grid.appendChild(this.createBusLayout());
        break;
      case 'train':
        grid.appendChild(this.createTrainLayout());
        break;
      case 'plane':
        grid.appendChild(this.createPlaneLayout());
        break;
      default:
        grid.appendChild(this.createGenericLayout());
    }

    return grid;
  }

  private createBusLayout(): HTMLElement {
    const busLayout = document.createElement('div');
    busLayout.className = 'max-w-md mx-auto';

    // Driver section
    const driverSection = this.createDriverSection();
    busLayout.appendChild(driverSection);

    // Seats layout (2+2 configuration)
    const seatsContainer = this.createSeatsContainer(2, [2]); // 2 seats per side, aisle in middle
    busLayout.appendChild(seatsContainer);

    return busLayout;
  }

  private createTrainLayout(): HTMLElement {
    const trainLayout = document.createElement('div');
    trainLayout.className = 'max-w-4xl mx-auto';

    // Train coach header
    const coachHeader = document.createElement('div');
    coachHeader.className = 'flex justify-between items-center mb-4 p-3 bg-blue-50 rounded-lg';
    coachHeader.innerHTML = `
      <div class="text-sm font-medium text-gray-700">Coach Layout</div>
      <div class="text-sm text-gray-600">→ Direction of Travel →</div>
    `;
    trainLayout.appendChild(coachHeader);

    // Create different sections for different classes
    const sections = this.createTrainSections();
    sections.forEach(section => trainLayout.appendChild(section));

    return trainLayout;
  }

  private createTrainSections(): HTMLElement[] {
    const sections: HTMLElement[] = [];
    
    // Group seats by class
    const seatsByClass = this.groupSeatsByClass();
    
    Object.entries(seatsByClass).forEach(([className, classSeats]) => {
      if (classSeats.length === 0) return;

      const section = document.createElement('div');
      section.className = 'mb-6';
      
      // Section header
      const header = document.createElement('div');
      header.className = `p-2 text-sm font-medium text-center rounded-t-lg ${this.getClassHeaderStyle(className)}`;
      header.textContent = `${className.toUpperCase()} CLASS`;
      section.appendChild(header);

      // Seats grid for this class
      const seatsGrid = this.createTrainSeatsGrid(classSeats, className);
      section.appendChild(seatsGrid);
      
      sections.push(section);
    });

    return sections;
  }

  private createTrainSeatsGrid(seats: Seat[], className: string): HTMLElement {
    const grid = document.createElement('div');
    grid.className = `border border-t-0 rounded-b-lg p-4 ${this.getClassBackgroundStyle(className)}`;
    
    // Train typically has 3+2 or 2+3 configuration for sleeper/AC
    // 2+2 for chair car
    const config = className === 'economy' ? { left: 2, right: 2 } : { left: 2, right: 3 };
    
    const seatsContainer = document.createElement('div');
    seatsContainer.className = 'space-y-2';

    // Group seats into rows
    const rows = this.groupSeatsIntoRows(seats, config.left + config.right);
    
    rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'flex justify-center items-center gap-8';

      // Left side seats
      const leftSeats = document.createElement('div');
      leftSeats.className = 'flex gap-1';
      
      // Right side seats  
      const rightSeats = document.createElement('div');
      rightSeats.className = 'flex gap-1';

      row.forEach((seat, colIndex) => {
        const seatElement = this.createSeatElement(seat);
        if (colIndex < config.left) {
          leftSeats.appendChild(seatElement);
        } else {
          rightSeats.appendChild(seatElement);
        }
      });

      // Row number/berth info
      const rowInfo = document.createElement('div');
      rowInfo.className = 'text-xs text-gray-500 font-medium min-w-8 text-center bg-gray-100 rounded py-1 px-2';
      rowInfo.textContent = className === 'economy' ? `R${rowIndex + 1}` : `B${rowIndex + 1}`;

      rowElement.appendChild(leftSeats);
      rowElement.appendChild(rowInfo);
      rowElement.appendChild(rightSeats);
      seatsContainer.appendChild(rowElement);
    });

    grid.appendChild(seatsContainer);
    return grid;
  }

  private createPlaneLayout(): HTMLElement {
    const planeLayout = document.createElement('div');
    planeLayout.className = 'max-w-4xl mx-auto';

    // Aircraft nose
    const nose = document.createElement('div');
    nose.className = 'text-center mb-4';
    nose.innerHTML = `
      <div class="w-16 h-8 mx-auto bg-gray-300 rounded-full flex items-center justify-center">
        <span class="text-xs font-bold text-gray-600">NOSE</span>
      </div>
      <div class="text-xs text-gray-500 mt-1">← Front of Aircraft</div>
    `;
    planeLayout.appendChild(nose);

    // Create different cabin sections
    const sections = this.createPlaneSections();
    sections.forEach(section => planeLayout.appendChild(section));

    return planeLayout;
  }

  private createPlaneSections(): HTMLElement[] {
    const sections: HTMLElement[] = [];
    
    // Group seats by class (First, Business, Economy)
    const seatsByClass = this.groupSeatsByClass();
    
    // Define class order for aircraft
    const classOrder = ['first', 'business', 'premium', 'economy'];
    
    classOrder.forEach(className => {
      const classSeats = seatsByClass[className];
      if (!classSeats || classSeats.length === 0) return;

      const section = document.createElement('div');
      section.className = 'mb-4';
      
      // Section header with class info
      const header = document.createElement('div');
      header.className = `p-2 text-sm font-medium text-center rounded-t-lg ${this.getClassHeaderStyle(className)}`;
      header.textContent = `${className.toUpperCase()} CLASS`;
      section.appendChild(header);

      // Seats grid for this class
      const seatsGrid = this.createPlaneSeatsGrid(classSeats, className);
      section.appendChild(seatsGrid);
      
      sections.push(section);
    });

    return sections;
  }

  private createPlaneSeatsGrid(seats: Seat[], className: string): HTMLElement {
    const grid = document.createElement('div');
    grid.className = `border border-t-0 rounded-b-lg p-4 ${this.getClassBackgroundStyle(className)}`;
    
    // Aircraft seat configuration based on class
    const config = this.getAircraftSeatConfig(className);
    
    const seatsContainer = document.createElement('div');
    seatsContainer.className = 'space-y-1';

    // Group seats into rows
    const rows = this.groupSeatsIntoRows(seats, config.total);
    
    rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'flex justify-center items-center gap-6';

      // Create seat sections based on aircraft configuration
      const sections = this.createAircraftSeatSections(row, config);
      sections.forEach(section => rowElement.appendChild(section));

      // Row number
      const rowNumber = document.createElement('div');
      rowNumber.className = 'text-xs text-gray-500 font-medium min-w-6 text-center bg-gray-100 rounded py-1';
      rowNumber.textContent = `${rowIndex + 1}`;

      // Insert row number in the middle
      const middleIndex = Math.floor(sections.length / 2);
      rowElement.insertBefore(rowNumber, sections[middleIndex]);

      seatsContainer.appendChild(rowElement);
    });

    grid.appendChild(seatsContainer);
    return grid;
  }

  private getAircraftSeatConfig(className: string): { total: number; sections: number[] } {
    switch (className) {
      case 'first':
        return { total: 4, sections: [2, 2] }; // 2+2 configuration
      case 'business':
        return { total: 4, sections: [2, 2] }; // 2+2 configuration
      case 'premium':
        return { total: 6, sections: [3, 3] }; // 3+3 configuration
      case 'economy':
      default:
        return { total: 6, sections: [3, 3] }; // 3+3 configuration
    }
  }

  private createAircraftSeatSections(row: Seat[], config: { sections: number[] }): HTMLElement[] {
    const sections: HTMLElement[] = [];
    let seatIndex = 0;

    config.sections.forEach(sectionSize => {
      const section = document.createElement('div');
      section.className = 'flex gap-1';

      for (let i = 0; i < sectionSize && seatIndex < row.length; i++) {
        const seat = row[seatIndex];
        const seatElement = this.createSeatElement(seat);
        section.appendChild(seatElement);
        seatIndex++;
      }

      sections.push(section);
    });

    return sections;
  }

  private createDriverSection(): HTMLElement {
    const driverSection = document.createElement('div');
    driverSection.className = 'flex justify-between items-center mb-6 p-3 bg-gray-100 rounded-lg';
    driverSection.innerHTML = `
      <div class="w-12 h-8 bg-gray-600 rounded flex items-center justify-center">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="text-sm text-gray-600 font-medium">Driver</span>
    `;
    return driverSection;
  }

  private createSeatsContainer(seatsPerSide: number, aislePositions: number[]): HTMLElement {
    const seatsContainer = document.createElement('div');
    seatsContainer.className = 'space-y-3';

    this.options.seats.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'flex justify-between items-center gap-4';

      // Group seats by aisles
      const seatGroups = this.groupSeatsByAisle(row, aislePositions);
      
      seatGroups.forEach((group, groupIndex) => {
        const groupElement = document.createElement('div');
        groupElement.className = 'flex gap-2';
        
        group.forEach(seat => {
          const seatElement = this.createSeatElement(seat);
          groupElement.appendChild(seatElement);
        });
        
        rowElement.appendChild(groupElement);
        
        // Add row number in the middle
        if (groupIndex === Math.floor(seatGroups.length / 2)) {
          const rowNumber = document.createElement('div');
          rowNumber.className = 'text-xs text-gray-500 font-medium w-8 text-center bg-gray-50 rounded py-1';
          rowNumber.textContent = `${rowIndex + 1}`;
          rowElement.appendChild(rowNumber);
        }
      });

      seatsContainer.appendChild(rowElement);
    });

    return seatsContainer;
  }

  private createGenericLayout(): HTMLElement {
    const genericLayout = document.createElement('div');
    genericLayout.className = 'max-w-4xl mx-auto';

    const seatsContainer = document.createElement('div');
    seatsContainer.className = 'space-y-2';

    this.options.seats.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'flex justify-center items-center gap-4';

      const seatsRow = document.createElement('div');
      seatsRow.className = 'flex gap-2';

      row.forEach(seat => {
        const seatElement = this.createSeatElement(seat);
        seatsRow.appendChild(seatElement);
      });

      rowElement.appendChild(seatsRow);
      seatsContainer.appendChild(rowElement);
    });

    genericLayout.appendChild(seatsContainer);
    return genericLayout;
  }

  private groupSeatsByClass(): { [className: string]: Seat[] } {
    const grouped: { [className: string]: Seat[] } = {};
    
    this.options.seats.flat().forEach(seat => {
      if (!grouped[seat.class]) {
        grouped[seat.class] = [];
      }
      grouped[seat.class].push(seat);
    });

    return grouped;
  }

  private groupSeatsIntoRows(seats: Seat[], seatsPerRow: number): Seat[][] {
    const rows: Seat[][] = [];
    
    for (let i = 0; i < seats.length; i += seatsPerRow) {
      rows.push(seats.slice(i, i + seatsPerRow));
    }
    
    return rows;
  }

  private groupSeatsByAisle(row: Seat[], aislePositions: number[]): Seat[][] {
    const groups: Seat[][] = [];
    let currentGroup: Seat[] = [];
    
    row.forEach((seat, index) => {
      currentGroup.push(seat);
      
      if (aislePositions.includes(index + 1) || index === row.length - 1) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    });

    return groups;
  }

  private getClassHeaderStyle(className: string): string {
    const styles = {
      first: 'bg-purple-600 text-white',
      business: 'bg-blue-600 text-white',
      premium: 'bg-green-600 text-white',
      economy: 'bg-gray-600 text-white'
    };
    return styles[className as keyof typeof styles] || styles.economy;
  }

  private getClassBackgroundStyle(className: string): string {
    const styles = {
      first: 'bg-purple-50 border-purple-200',
      business: 'bg-blue-50 border-blue-200',
      premium: 'bg-green-50 border-green-200',
      economy: 'bg-gray-50 border-gray-200'
    };
    return styles[className as keyof typeof styles] || styles.economy;
  }

  private createSeatElement(seat: Seat): HTMLElement {
    const seatElement = document.createElement('button');
    seatElement.className = this.getSeatClasses(seat);
    seatElement.dataset.seatId = seat.id;
    seatElement.textContent = seat.number;
    seatElement.disabled = seat.status === 'booked' || seat.status === 'blocked';
    seatElement.type = 'button';

    // Store reference
    this.seatElements.set(seat.id, seatElement);

    return seatElement;
  }

  private getSeatClasses(seat: Seat): string {
    const baseClasses = 'w-10 h-10 text-xs font-bold rounded transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-blue-400';
    
    const statusClasses = {
      available: 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-400 hover:shadow-md hover:scale-105',
      selected: 'bg-blue-500 border-2 border-blue-600 text-white shadow-md scale-105',
      booked: 'bg-gray-400 border-2 border-gray-500 text-white cursor-not-allowed opacity-60',
      blocked: 'bg-red-400 border-2 border-red-500 text-white cursor-not-allowed opacity-60'
    };

    const classRings = {
      economy: '',
      business: 'ring-2 ring-yellow-300',
      premium: 'ring-2 ring-purple-300',
      first: 'ring-2 ring-pink-300'
    };

    return `${baseClasses} ${statusClasses[seat.status]} ${classRings[seat.class]}`;
  }

  private createSelectionInfo(): HTMLElement {
    const info = document.createElement('div');
    info.className = 'mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200';
    this.updateSelectionInfo(info);
    return info;
  }

  private updateSelectionInfo(info: HTMLElement): void {
    const selectedCount = this.selectedSeats.size;
    const maxSelection = this.options.maxSelection;
    
    if (selectedCount === 0) {
      info.innerHTML = `
        <div class="text-center text-gray-600">
          <p class="text-sm">Select up to ${maxSelection} seats</p>
        </div>
      `;
    } else {
      const selectedSeatsList = Array.from(this.selectedSeats).map(seatId => {
        const seat = this.findSeatById(seatId);
        return seat ? `${seat.number} (${seat.class.toUpperCase()})` : seatId;
      }).join(', ');

      const totalPrice = this.getTotalPrice();

      info.innerHTML = `
        <div class="text-center">
          <p class="text-sm text-gray-700 mb-2">Selected Seats: <span class="font-semibold">${selectedSeatsList}</span></p>
          <p class="text-lg font-bold text-blue-600">Total: ৳${totalPrice}</p>
          <p class="text-xs text-gray-500">${selectedCount}/${maxSelection} seats selected</p>
        </div>
      `;
    }
  }

  private createClearButton(): HTMLElement {
    const button = document.createElement('button');
    button.className = 'w-full mt-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 font-medium';
    button.textContent = 'Clear Selection';
    button.type = 'button';
    button.addEventListener('click', () => this.clearSelection());
    return button;
  }

  private attachEventListeners(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.seatId) {
        this.handleSeatClick(target.dataset.seatId);
      }
    });

    if (this.options.showTooltip) {
      this.container.addEventListener('mouseenter', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.seatId) {
          this.showTooltip(e, target.dataset.seatId);
        }
      }, true);

      this.container.addEventListener('mouseleave', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.seatId) {
          this.hideTooltip();
        }
      }, true);

      this.container.addEventListener('mousemove', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.seatId && !this.tooltip.classList.contains('hidden')) {
          this.updateTooltipPosition(e);
        }
      });
    }
  }

  private handleSeatClick(seatId: string): void {
    const seat = this.findSeatById(seatId);
    if (!seat || seat.status === 'booked' || seat.status === 'blocked') {
      return;
    }

    const seatElement = this.seatElements.get(seatId);
    if (!seatElement) return;

    if (this.selectedSeats.has(seatId)) {
      // Deselect seat
      this.selectedSeats.delete(seatId);
      seat.status = 'available';
      seatElement.className = this.getSeatClasses(seat);
      this.options.onSeatDeselect(seat);
    } else {
      // Select seat
      if (this.selectedSeats.size >= this.options.maxSelection) {
        alert(`You can select maximum ${this.options.maxSelection} seats`);
        return;
      }

      this.selectedSeats.add(seatId);
      seat.status = 'selected';
      seatElement.className = this.getSeatClasses(seat);
      this.options.onSeatSelect(seat);
    }

    this.updateSelectionInfo(this.selectionInfo);
  }

  private showTooltip(e: MouseEvent, seatId: string): void {
    const seat = this.findSeatById(seatId);
    if (!seat) return;

    const classNames = {
      economy: 'Economy',
      business: 'Business',
      premium: 'Premium',
      first: 'First'
    };

    const statusNames = {
      available: 'Available',
      selected: 'Selected',
      booked: 'Booked',
      blocked: 'Blocked'
    };

    this.tooltip.innerHTML = `
      <div class="text-center">
        <div class="font-semibold">Seat ${seat.number}</div>
        <div class="text-gray-300">${classNames[seat.class]} Class</div>
        <div class="text-gray-300">৳${seat.price}</div>
        <div class="text-gray-300">${statusNames[seat.status]}</div>
      </div>
    `;

    this.updateTooltipPosition(e);
    this.tooltip.classList.remove('hidden');
  }

  private updateTooltipPosition(e: MouseEvent): void {
    this.tooltip.style.left = `${e.pageX}px`;
    this.tooltip.style.top = `${e.pageY}px`;
  }

  private hideTooltip(): void {
    this.tooltip.classList.add('hidden');
  }

  private findSeatById(seatId: string): Seat | null {
    for (const row of this.options.seats) {
      for (const seat of row) {
        if (seat.id === seatId) {
          return seat;
        }
      }
    }
    return null;
  }

  private getTotalPrice(): number {
    let total = 0;
    this.selectedSeats.forEach(seatId => {
      const seat = this.findSeatById(seatId);
      if (seat) {
        total += seat.price;
      }
    });
    return total;
  }

  private clearSelection(): void {
    this.selectedSeats.forEach(seatId => {
      const seat = this.findSeatById(seatId);
      const seatElement = this.seatElements.get(seatId);
      if (seat && seatElement) {
        seat.status = 'available';
        seatElement.className = this.getSeatClasses(seat);
        this.options.onSeatDeselect(seat);
      }
    });

    this.selectedSeats.clear();
    this.updateSelectionInfo(this.selectionInfo);
  }

  // Public methods
  public getSelectedSeats(): Seat[] {
    return Array.from(this.selectedSeats).map(seatId => this.findSeatById(seatId)).filter(seat => seat !== null) as Seat[];
  }

  public getTotalSelectedPrice(): number {
    return this.getTotalPrice();
  }

  public setMaxSelection(max: number): void {
    this.options.maxSelection = max;
  }

  public updateLayout(newLayout: VehicleLayout): void {
    this.layout = newLayout;
    this.options.vehicleLayout = newLayout;
    this.render();
  }

  public destroy(): void {
    if (this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
  }
}

// Utility functions for creating dynamic seat data
export function createDynamicSeats(
  vehicleType: 'bus' | 'train' | 'plane',
  totalSeats: number,
  bookedSeats: string[] = [],
  classPrices: { [key: string]: number } = {}
): { seats: Seat[][], layout: VehicleLayout } {
  
  const layout = createVehicleLayout(vehicleType, totalSeats);
  const seats: Seat[][] = [];
  
  let seatCounter = 1;
  
  for (let row = 0; row < layout.rows; row++) {
    const seatRow: Seat[] = [];
    
    for (let col = 0; col < layout.columns; col++) {
      if (seatCounter > totalSeats) break;
      
      const seatNumber = generateSeatNumber(vehicleType, row + 1, col + 1);
      const seatClass = determineSeatClass(vehicleType, row + 1, layout);
      const basePrice = getClassBasePrice(seatClass, classPrices);
      const isBooked = bookedSeats.includes(seatNumber);
      
      seatRow.push({
        id: `seat-${row}-${col}`,
        row: row + 1,
        column: col + 1,
        number: seatNumber,
        class: seatClass,
        status: isBooked ? 'booked' : 'available',
        price: basePrice
      });
      
      seatCounter++;
    }
    
    if (seatRow.length > 0) {
      seats.push(seatRow);
    }
  }
  
  return { seats, layout };
}

function createVehicleLayout(vehicleType: 'bus' | 'train' | 'plane', totalSeats: number): VehicleLayout {
  switch (vehicleType) {
    case 'bus':
      return {
        type: 'bus',
        rows: Math.ceil(totalSeats / 4),
        columns: 4,
        seatConfiguration: {
          seatsPerRow: 4,
          aislePositions: [2]
        },
        classAreas: {
          premium: { startRow: 1, endRow: 2 },
          business: { startRow: 3, endRow: 5 },
          economy: { startRow: 6, endRow: Math.ceil(totalSeats / 4) }
        }
      };
    
    case 'train':
      return {
        type: 'train',
        rows: Math.ceil(totalSeats / 5),
        columns: 5,
        seatConfiguration: {
          seatsPerRow: 5,
          aislePositions: [2, 3]
        },
        classAreas: {
          first: { startRow: 1, endRow: 2 },
          business: { startRow: 3, endRow: 5 },
          economy: { startRow: 6, endRow: Math.ceil(totalSeats / 5) }
        }
      };
    
    case 'plane':
      return {
        type: 'plane',
        rows: Math.ceil(totalSeats / 6),
        columns: 6,
        seatConfiguration: {
          seatsPerRow: 6,
          aislePositions: [3]
        },
        classAreas: {
          first: { startRow: 1, endRow: 2 },
          business: { startRow: 3, endRow: 6 },
          premium: { startRow: 7, endRow: 10 },
          economy: { startRow: 11, endRow: Math.ceil(totalSeats / 6) }
        }
      };
    
    default:
      return createVehicleLayout('bus', totalSeats);
  }
}

function generateSeatNumber(vehicleType: 'bus' | 'train' | 'plane', row: number, col: number): string {
  const seatLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  
  switch (vehicleType) {
    case 'bus':
      return `${row}${seatLetters[col - 1]}`;
    case 'train':
      return `${row}${seatLetters[col - 1]}`;
    case 'plane':
      return `${row}${seatLetters[col - 1]}`;
    default:
      return `${row}${seatLetters[col - 1]}`;
  }
}

function determineSeatClass(
  vehicleType: 'bus' | 'train' | 'plane', 
  row: number, 
  layout: VehicleLayout
): 'economy' | 'business' | 'premium' | 'first' {
  
  for (const [className, area] of Object.entries(layout.classAreas)) {
    if (row >= area.startRow && row <= area.endRow) {
      return className as 'economy' | 'business' | 'premium' | 'first';
    }
  }
  
  return 'economy';
}

function getClassBasePrice(seatClass: 'economy' | 'business' | 'premium' | 'first', classPrices: { [key: string]: number }): number {
  // First, try to get the price from the provided classPrices
  if (classPrices[seatClass]) {
    return classPrices[seatClass];
  }
  
  // Try case-insensitive lookup
  const upperClass = seatClass.toUpperCase();
  if (classPrices[upperClass]) {
    return classPrices[upperClass];
  }
  
  // Try lowercase lookup
  const lowerClass = seatClass.toLowerCase();
  if (classPrices[lowerClass]) {
    return classPrices[lowerClass];
  }
  
  // If no specific price found, try to get any available price as fallback
  const availablePrices = Object.values(classPrices).filter(price => typeof price === 'number' && price > 0);
  if (availablePrices.length > 0) {
    return availablePrices[0]; // Return the first available price
  }
  
  // Final fallback - use reasonable defaults only if no prices provided at all
  const defaultPrices = {
    economy: 300,
    business: 500,
    premium: 800,
    first: 1200
  };
  
  return defaultPrices[seatClass];
}

// Sample data generator for testing
export function createSampleSeats(layout: 'bus' | 'train' | 'plane' = 'bus', rows: number = 10): Seat[][] {
  const result = createDynamicSeats(layout, rows * (layout === 'plane' ? 6 : layout === 'train' ? 5 : 4), [], {});
  return result.seats;
}
