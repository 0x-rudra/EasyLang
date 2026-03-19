// ─────────────────────────────────────────────
//  EasyLang Interpreter  —  Tree-walker
// ─────────────────────────────────────────────

// No TokenType needed here — the interpreter works with AST node types only.

class RuntimeError extends Error {
  constructor(msg, line) {
    super(msg);
    this.line = line;
    this.name = 'RuntimeError';
  }
}

class ReturnSignal {
  constructor(value) { this.value = value; }
}

class StopSignal {}

class Environment {
  constructor(parent = null) {
    this.vars = {};
    this.parent = parent;
  }
  get(name) {
    if (name in this.vars) return this.vars[name];
    if (this.parent) return this.parent.get(name);
    return undefined;
  }
  has(name) {
    if (name in this.vars) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
  set(name, value) {
    // Update existing if found in scope chain
    if (name in this.vars) { this.vars[name] = value; return; }
    if (this.parent && this.parent.has(name)) { this.parent.set(name, value); return; }
    this.vars[name] = value;
  }
  define(name, value) { this.vars[name] = value; }
}

class EasyLangFunction {
  constructor(name, params, body, closure) {
    this.name = name;
    this.params = params;
    this.body = body;
    this.closure = closure;
  }
}

class Interpreter {
  constructor(outputCallback, inputCallback) {
    this.output = outputCallback || ((v) => console.log(v));
    this.askInput = inputCallback || (() => '');
    this.global = new Environment();
    this._stepCount = 0;
    this._maxSteps = 100000;
    this._defineBuiltins();
  }

  _defineBuiltins() {
    // Built-in math functions accessible as variables
    this.global.define('pi', Math.PI);
    this.global.define('e', Math.E);
  }

  interpret(ast) {
    this._stepCount = 0;
    return this._execBlock(ast.body, this.global);
  }

  _execBlock(stmts, env) {
    for (const stmt of stmts) {
      const result = this._execStmt(stmt, env);
      if (result instanceof ReturnSignal) return result;
      if (result instanceof StopSignal) return result;
    }
  }

  _execStmt(stmt, env) {
    this._stepCount++;
    if (this._stepCount > this._maxSteps) {
      throw new RuntimeError('Infinite loop detected! Program ran too many steps.', stmt.line);
    }

    switch (stmt.type) {
      case 'SetStmt':    return this._execSet(stmt, env);
      case 'SayStmt':    return this._execSay(stmt, env);
      case 'AskStmt':    return this._execAsk(stmt, env);
      case 'IfStmt':     return this._execIf(stmt, env);
      case 'RepeatStmt': return this._execRepeat(stmt, env);
      case 'LoopStmt':   return this._execLoop(stmt, env);
      case 'WhileStmt':  return this._execWhile(stmt, env);
      case 'DefineStmt': return this._execDefine(stmt, env);
      case 'CallStmt':   return this._execCallStmt(stmt, env);
      case 'ReturnStmt': return this._execReturn(stmt, env);
      case 'AddStmt':    return this._execAdd(stmt, env);
      case 'RemoveStmt': return this._execRemove(stmt, env);
      case 'StopStmt':   return new StopSignal();
      case 'ExprStmt':   this._evalExpr(stmt.expr, env); return;
      default:
        throw new RuntimeError(`Unknown statement type: ${stmt.type}`, stmt.line);
    }
  }

  _execSet(stmt, env) {
    const val = this._evalExpr(stmt.value, env);
    env.set(stmt.name, val);
  }

  _execSay(stmt, env) {
    const val = this._evalExpr(stmt.value, env);
    this.output(this._stringify(val));
  }

  _execAsk(stmt, env) {
    const prompt = this._evalExpr(stmt.prompt, env);
    const result = this.askInput(this._stringify(prompt));
    if (stmt.varName) {
      // Try to parse as number
      const num = Number(result);
      env.set(stmt.varName, isNaN(num) ? result : num);
    }
  }

  _execIf(stmt, env) {
    const cond = this._evalExpr(stmt.condition, env);
    if (this._truthy(cond)) {
      return this._execBlock(stmt.consequent, new Environment(env));
    }
    for (const alt of stmt.alternates) {
      if (this._truthy(this._evalExpr(alt.condition, env))) {
        return this._execBlock(alt.body, new Environment(env));
      }
    }
    if (stmt.elseBody) {
      return this._execBlock(stmt.elseBody, new Environment(env));
    }
  }

  _execRepeat(stmt, env) {
    let count = this._evalExpr(stmt.count, env);
    if (typeof count !== 'number') throw new RuntimeError(`'repeat' needs a number, got '${count}'`, stmt.line);
    if (!Number.isFinite(count)) throw new RuntimeError(`'repeat' count must be a finite number`, stmt.line);
    count = Math.floor(count);
    if (count < 0) throw new RuntimeError(`'repeat' count cannot be negative`, stmt.line);
    for (let i = 0; i < count; i++) {
      const result = this._execBlock(stmt.body, new Environment(env));
      if (result instanceof StopSignal) break;
      if (result instanceof ReturnSignal) return result;
    }
  }

  _execLoop(stmt, env) {
    const start = this._evalExpr(stmt.start, env);
    const end = this._evalExpr(stmt.end, env);
    const step = stmt.step ? this._evalExpr(stmt.step, env) : (start <= end ? 1 : -1);
    if (typeof start !== 'number' || typeof end !== 'number') {
      throw new RuntimeError(`'loop' start and end must be numbers`, stmt.line);
    }
    if (typeof step !== 'number' || !Number.isFinite(step)) {
      throw new RuntimeError(`'loop' step must be a finite number`, stmt.line);
    }
    if (step === 0) {
      throw new RuntimeError(`'loop' step cannot be 0`, stmt.line);
    }

    if (start < end && step < 0) {
      throw new RuntimeError(`'loop' step must be positive when counting up`, stmt.line);
    }
    if (start > end && step > 0) {
      throw new RuntimeError(`'loop' step must be negative when counting down`, stmt.line);
    }

    const loopEnv = new Environment(env);
    if (step > 0) {
      for (let i = start; i <= end; i += step) {
        loopEnv.define(stmt.varName, i);
        const result = this._execBlock(stmt.body, new Environment(loopEnv));
        if (result instanceof StopSignal) break;
        if (result instanceof ReturnSignal) return result;
      }
    } else {
      for (let i = start; i >= end; i += step) {
        loopEnv.define(stmt.varName, i);
        const result = this._execBlock(stmt.body, new Environment(loopEnv));
        if (result instanceof StopSignal) break;
        if (result instanceof ReturnSignal) return result;
      }
    }
  }

  _execWhile(stmt, env) {
    let iters = 0;
    while (this._truthy(this._evalExpr(stmt.condition, env))) {
      if (++iters > this._maxSteps) throw new RuntimeError('Infinite loop in while!', stmt.line);
      const result = this._execBlock(stmt.body, new Environment(env));
      if (result instanceof StopSignal) break;
      if (result instanceof ReturnSignal) return result;
    }
  }

  _execDefine(stmt, env) {
    const fn = new EasyLangFunction(stmt.name, stmt.params, stmt.body, env);
    env.define(stmt.name, fn);
  }

  _execCallStmt(stmt, env) {
    const fn = env.get(stmt.name);
    if (!fn) throw new RuntimeError(`Function '${stmt.name}' is not defined`, stmt.line);
    const args = stmt.args.map(a => this._evalExpr(a, env));
    this._callFunction(fn, args, stmt.line);
  }

  _execReturn(stmt, env) {
    const value = stmt.value ? this._evalExpr(stmt.value, env) : null;
    return new ReturnSignal(value);
  }

  _execAdd(stmt, env) {
    const list = env.get(stmt.listName);
    if (!Array.isArray(list)) throw new RuntimeError(`'${stmt.listName}' is not a list`, stmt.line);
    const val = this._evalExpr(stmt.value, env);
    list.push(val);
  }

  _execRemove(stmt, env) {
    const list = env.get(stmt.listName);
    if (!Array.isArray(list)) throw new RuntimeError(`'${stmt.listName}' is not a list`, stmt.line);
    const val = this._evalExpr(stmt.value, env);
    const idx = list.indexOf(val);
    if (idx !== -1) list.splice(idx, 1);
  }

  // ── Expression evaluator ───────────────────
  _evalExpr(expr, env) {
    switch (expr.type) {
      case 'Literal':    return expr.value;
      case 'Identifier': return this._evalIdentifier(expr, env);
      case 'BinaryExpr': return this._evalBinary(expr, env);
      case 'UnaryExpr':  return this._evalUnary(expr, env);
      case 'BuiltinExpr':return this._evalBuiltin(expr, env);
      case 'CallExpr':   return this._evalCallExpr(expr, env);
      case 'ListExpr':   return expr.items.map(i => this._evalExpr(i, env));
      case 'IndexExpr':  return this._evalIndex(expr, env);
      case 'MemberExpr': return this._evalMember(expr, env);
      default:
        throw new RuntimeError(`Unknown expression type: ${expr.type}`, expr.line);
    }
  }

  _evalIdentifier(expr, env) {
    if (!env.has(expr.name)) {
      throw new RuntimeError(`Variable '${expr.name}' is not defined. Did you use 'set ${expr.name} to ...' first?`, expr.line);
    }
    return env.get(expr.name);
  }

  _evalBinary(expr, env) {
    const left = this._evalExpr(expr.left, env);
    const right = this._evalExpr(expr.right, env);
    switch (expr.op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string')
          return this._stringify(left) + this._stringify(right);
        return left + right;
      case '-': return this._num(left, expr) - this._num(right, expr);
      case '*': return this._num(left, expr) * this._num(right, expr);
      case '/':
        if (right === 0) throw new RuntimeError('Cannot divide by zero!', expr.line);
        return this._num(left, expr) / this._num(right, expr);
      case '%': return this._num(left, expr) % this._num(right, expr);
      case '^': return Math.pow(this._num(left, expr), this._num(right, expr));
      case '==': return left === right;
      case '!=': return left !== right;
      case '<':  return left < right;
      case '<=': return left <= right;
      case '>':  return left > right;
      case '>=': return left >= right;
      case 'and': return this._truthy(left) && this._truthy(right);
      case 'or':  return this._truthy(left) || this._truthy(right);
      default: throw new RuntimeError(`Unknown operator '${expr.op}'`, expr.line);
    }
  }

  _evalUnary(expr, env) {
    const right = this._evalExpr(expr.right, env);
    if (expr.op === '-') return -this._num(right, expr);
    if (expr.op === 'not') return !this._truthy(right);
    throw new RuntimeError(`Unknown unary op '${expr.op}'`, expr.line);
  }

  _evalBuiltin(expr, env) {
    const arg = this._evalExpr(expr.arg, env);
    switch (expr.op) {
      case 'length':    return Array.isArray(arg) ? arg.length : String(arg).length;
      case 'uppercase': return String(arg).toUpperCase();
      case 'lowercase': return String(arg).toLowerCase();
      case 'type':      return Array.isArray(arg) ? 'list' : typeof arg;
      case 'floor':     return Math.floor(this._num(arg));
      case 'ceil':      return Math.ceil(this._num(arg));
      case 'round':     return Math.round(this._num(arg));
      case 'abs':       return Math.abs(this._num(arg));
      case 'sqrt':      return Math.sqrt(this._num(arg));
      case 'random':    return Math.floor(Math.random() * this._num(arg));
      case 'first':     return Array.isArray(arg) ? arg[0] : String(arg)[0];
      case 'last':      return Array.isArray(arg) ? arg[arg.length - 1] : String(arg)[String(arg).length - 1];
      case 'reverse':   return Array.isArray(arg) ? [...arg].reverse() : String(arg).split('').reverse().join('');
      case 'sorted':    return Array.isArray(arg) ? [...arg].sort((a, b) => a < b ? -1 : a > b ? 1 : 0) : String(arg);
      case 'sum':       return Array.isArray(arg) ? arg.reduce((a, b) => a + b, 0) : 0;
      case 'string':    return this._stringify(arg);
      case 'number': {
        const n = Number(arg);
        if (Number.isNaN(n)) {
          throw new RuntimeError(`Cannot convert '${this._stringify(arg)}' to number`, expr.line);
        }
        return n;
      }
      case 'join':      return Array.isArray(arg) ? arg.join(', ') : String(arg);
      default: throw new RuntimeError(`Unknown built-in '${expr.op}'`, 0);
    }
  }

  _evalCallExpr(expr, env) {
    const fn = env.get(expr.name);
    if (!fn) throw new RuntimeError(`Function '${expr.name}' is not defined`, expr.line);
    const args = expr.args.map(a => this._evalExpr(a, env));
    return this._callFunction(fn, args, expr.line);
  }

  _callFunction(fn, args, line) {
    if (!(fn instanceof EasyLangFunction)) {
      throw new RuntimeError(`'${fn}' is not a function`, line);
    }
    if (args.length !== fn.params.length) {
      throw new RuntimeError(
        `Function '${fn.name}' expects ${fn.params.length} argument(s), got ${args.length}`, line
      );
    }
    const fnEnv = new Environment(fn.closure);
    fn.params.forEach((p, i) => fnEnv.define(p, args[i]));
    const result = this._execBlock(fn.body, fnEnv);
    if (result instanceof ReturnSignal) return result.value;
    return null;
  }

  _evalIndex(expr, env) {
    const obj = this._evalExpr(expr.object, env);
    const idx = this._evalExpr(expr.index, env);
    if (Array.isArray(obj)) {
      const i = idx < 0 ? obj.length + idx : idx;
      if (i < 0 || i >= obj.length) throw new RuntimeError(`List index ${idx} out of bounds`, expr.line);
      return obj[i];
    }
    if (typeof obj === 'string') return obj[idx] ?? null;
    throw new RuntimeError(`Cannot index into type '${typeof obj}'`, expr.line);
  }

  _evalMember(expr, env) {
    const obj = this._evalExpr(expr.object, env);
    if (Array.isArray(obj)) {
      if (expr.prop === 'length') return obj.length;
      if (expr.prop === 'first') return obj[0];
      if (expr.prop === 'last') return obj[obj.length - 1];
    }
    if (typeof obj === 'string') {
      if (expr.prop === 'length') return obj.length;
    }
    throw new RuntimeError(`Unknown property '${expr.prop}'`, 0);
  }

  // ── Helpers ───────────────────────────────
  _truthy(val) {
    if (val === null || val === undefined || val === false || val === 0 || val === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }

  _num(val, expr) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = Number(val);
      if (!isNaN(n)) return n;
    }
    throw new RuntimeError(`Expected a number but got '${this._stringify(val)}'`, expr ? expr.line : 0);
  }

  _stringify(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (Array.isArray(val)) return '[' + val.map(v => this._stringify(v)).join(', ') + ']';
    return String(val);
  }
}

if (typeof module !== 'undefined') module.exports = { Interpreter, RuntimeError, Environment };
