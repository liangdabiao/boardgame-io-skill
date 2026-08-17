// Board UI — render only. All rules live in game.js; never compute
// game logic here. Interactive elements must be gated on `isActive`.

export const Board = ({ G, ctx, moves, isActive }) => (
  <div className="board">
    {ctx.gameover ? (
      <h2 className="result">
        {ctx.gameover.winner != null ? `Player ${ctx.gameover.winner} wins!` : 'Draw!'}
      </h2>
    ) : (
      <p className="status">Turn: player {ctx.currentPlayer}</p>
    )}
    <div className="grid">
      {G.cells.map((cell, id) => (
        <button
          key={id}
          className="cell"
          disabled={!isActive || cell !== null || !!ctx.gameover}
          onClick={() => moves.clickCell(id)}
        >
          {cell === null ? '' : cell === '0' ? '×' : '○'}
        </button>
      ))}
    </div>
  </div>
);

export default Board;
