import { COLS, ROWS, ROTATIONS } from "./constants";
import { isFruitCell } from "./utils";
import type { Board, Cell, ClearGroup, FruitPair, GridPosition, PairPiece, PieceCell } from "./types";

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function makePiece(pair: FruitPair): PairPiece {
  return {
    axis: { x: 2, y: 0, fruit: pair[0] },
    satellite: { fruit: pair[1], rotation: 0 },
  };
}

export function getPieceCells(piece: PairPiece): PieceCell[] {
  const offset = ROTATIONS[piece.satellite.rotation];
  return [
    { x: piece.axis.x, y: piece.axis.y, fruit: piece.axis.fruit, role: "axis" },
    { x: piece.axis.x + offset.x, y: piece.axis.y + offset.y, fruit: piece.satellite.fruit, role: "satellite" },
  ];
}

export function isValidPiece(board: Board, piece: PairPiece): boolean {
  return getPieceCells(piece).every(({ x, y }) => {
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y < 0) return true;
    return board[y][x] === null;
  });
}

export function movedPiece(piece: PairPiece, dx: number, dy: number): PairPiece {
  return {
    ...piece,
    axis: { ...piece.axis, x: piece.axis.x + dx, y: piece.axis.y + dy },
  };
}

export function rotatedPiece(piece: PairPiece, kick: number): PairPiece {
  return {
    ...piece,
    axis: { ...piece.axis, x: piece.axis.x + kick },
    satellite: { ...piece.satellite, rotation: (piece.satellite.rotation + 1) % ROTATIONS.length },
  };
}

export function applyGravity(board: Board): void {
  for (let x = 0; x < COLS; x += 1) {
    const stack: Cell[] = [];
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      const cell = board[y][x];
      if (cell !== null) stack.push(cell);
      board[y][x] = null;
    }
    for (let index = 0; index < stack.length; index += 1) {
      board[ROWS - 1 - index][x] = stack[index];
    }
  }
}

export function findClearGroups(board: Board): ClearGroup[] {
  const visited = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const groups: ClearGroup[] = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const fruit = board[y][x];
      if (!isFruitCell(fruit) || visited[y][x]) continue;

      const cells: GridPosition[] = [];
      const queue: GridPosition[] = [{ x, y }];
      visited[y][x] = true;

      while (queue.length) {
        const current = queue.shift();
        if (!current) continue;
        cells.push(current);

        for (const neighbor of neighbors(current.x, current.y)) {
          if (visited[neighbor.y][neighbor.x] || board[neighbor.y][neighbor.x] !== fruit) continue;
          visited[neighbor.y][neighbor.x] = true;
          queue.push(neighbor);
        }
      }

      if (cells.length >= 4) {
        groups.push({ fruit, cells });
      }
    }
  }

  return groups;
}

export function neighbors(x: number, y: number): GridPosition[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].filter((position) => inBounds(position.x, position.y));
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}
