// ─────────────────────────────────────────────
//  EasyLang Parser  —  AST Builder
// ─────────────────────────────────────────────

const __EASYLANG_TOKEN_TYPE =
  (typeof TokenType !== 'undefined')
    ? TokenType
    : ((typeof globalThis !== 'undefined' && globalThis.TokenType)
      ? globalThis.TokenType
      : (typeof require !== 'undefined' ? require('./lexer.js').TokenType : undefined));

(function(TokenType) {
if (!TokenType) {
  throw new Error('EasyLang parser could not find TokenType. Ensure lexer.js loads before parser.js.');
}

class ParseError extends Error {
  constructor(msg, line) {
    super(msg);
    this.line = line;
    this.name = 'ParseError';
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) { return this.tokens[this.pos + offset]; }
  advance() { return this.tokens[this.pos++]; }
  isAtEnd() { return this.peek().type === TokenType.EOF; }

  check(...types) { return types.includes(this.peek().type); }

  match(...types) {
    if (types.includes(this.peek().type)) { return this.advance(); }
    return null;
  }

  consume(type, msg) {
    if (this.peek().type === type) return this.advance();
    throw new ParseError(`${msg} (got '${this.peek().value ?? this.peek().type}' on line ${this.peek().line})`, this.peek().line);
  }

  // Consume the next token as a name regardless of type (allows keyword-names like 'add', 'remove')
  consumeName(msg) {
    const tok = this.peek();
    if (tok.type === TokenType.EOF || tok.type === TokenType.NEWLINE) {
      throw new ParseError(msg + ` (got end-of-line on line ${tok.line})`, tok.line);
    }
    this.advance();
    // Return the string value, coercing keywords to their word form
    return typeof tok.value === 'string' ? tok.value : tok.type.toLowerCase();
  }

  skipNewlines() {
    while (this.check(TokenType.NEWLINE)) this.advance();
  }

  requireNewline() {
    if (!this.check(TokenType.NEWLINE) && !this.isAtEnd()) {
      // Be lenient — allow EOF too
    }
    while (this.check(TokenType.NEWLINE)) this.advance();
  }

  // ── Top level ──────────────────────────────
  parse() {
    const stmts = [];
    this.skipNewlines();
    while (!this.isAtEnd()) {
      stmts.push(this.statement());
      this.requireNewline();
    }
    return { type: 'Program', body: stmts };
  }

  block(terminators = [TokenType.END]) {
    const stmts = [];
    this.skipNewlines();
    while (!this.isAtEnd() && !this.check(...terminators)) {
      // Check combined else/elseif
      if (this.check(TokenType.ELSE, TokenType.ELSEIF)) break;
      stmts.push(this.statement());
      this.requireNewline();
    }
    return stmts;
  }

  statement() {
    this.skipNewlines();
    const tok = this.peek();

    if (tok.type === TokenType.SET)    return this.setStatement();
    if (tok.type === TokenType.SAY)    return this.sayStatement();
    if (tok.type === TokenType.ASK)    return this.askStatement();
    if (tok.type === TokenType.IF)     return this.ifStatement();
    if (tok.type === TokenType.REPEAT) return this.repeatStatement();
    if (tok.type === TokenType.LOOP)   return this.loopStatement();
    if (tok.type === TokenType.WHILE)  return this.whileStatement();
    if (tok.type === TokenType.DEFINE) return this.defineStatement();
    if (tok.type === TokenType.CALL)   return this.callStatement();
    if (tok.type === TokenType.RETURN) return this.returnStatement();
    if (tok.type === TokenType.ADD)    return this.addStatement();
    if (tok.type === TokenType.REMOVE) return this.removeStatement();
    if (tok.type === TokenType.STOP)   return this.stopStatement();

    // Expression statement (e.g. bare function call syntax)
    const expr = this.expression();
    return { type: 'ExprStmt', expr, line: tok.line };
  }

  // set <name> to <expr>
  setStatement() {
    const line = this.peek().line;
    this.consume(TokenType.SET, "Expected 'set'");
    const name = this.consume(TokenType.IDENTIFIER, "Expected variable name after 'set'").value;
    this.consume(TokenType.TO, `Expected 'to' after variable name '${name}'`);
    const value = this.expression();
    return { type: 'SetStmt', name, value, line };
  }

  // say <expr>
  sayStatement() {
    const line = this.peek().line;
    this.consume(TokenType.SAY, "Expected 'say'");
    const value = this.expression();
    return { type: 'SayStmt', value, line };
  }

  // ask <prompt> into <varname>
  askStatement() {
    const line = this.peek().line;
    this.consume(TokenType.ASK, "Expected 'ask'");
    const prompt = this.expression();
    let varName = null;
    if (this.match(TokenType.IN)) {
      varName = this.consume(TokenType.IDENTIFIER, "Expected variable name after 'in'").value;
    }
    return { type: 'AskStmt', prompt, varName, line };
  }

  // if <cond> \n body \n [elseif <cond> \n body]* [else \n body] end
  ifStatement() {
    const line = this.peek().line;
    this.consume(TokenType.IF, "Expected 'if'");
    const condition = this.expression();
    this.requireNewline();
    const consequent = this.block([TokenType.END, TokenType.ELSE, TokenType.ELSEIF]);
    const alternates = [];

    while (this.check(TokenType.ELSEIF)) {
      const eline = this.peek().line;
      this.advance();
      const cond = this.expression();
      this.requireNewline();
      const body = this.block([TokenType.END, TokenType.ELSE, TokenType.ELSEIF]);
      alternates.push({ condition: cond, body, line: eline });
    }

    let elseBody = null;
    if (this.match(TokenType.ELSE)) {
      this.requireNewline();
      elseBody = this.block([TokenType.END]);
    }
    this.consume(TokenType.END, "Expected 'end' to close 'if'");
    return { type: 'IfStmt', condition, consequent, alternates, elseBody, line };
  }

  // repeat <expr> [times]
  repeatStatement() {
    const line = this.peek().line;
    this.consume(TokenType.REPEAT, "Expected 'repeat'");
    const count = this.expression();
    this.match(TokenType.TIMES);
    this.requireNewline();
    const body = this.block([TokenType.END]);
    this.consume(TokenType.END, "Expected 'end' to close 'repeat'");
    return { type: 'RepeatStmt', count, body, line };
  }

  // loop <var> from <expr> to <expr>
  loopStatement() {
    const line = this.peek().line;
    this.consume(TokenType.LOOP, "Expected 'loop'");
    const varName = this.consume(TokenType.IDENTIFIER, "Expected loop variable name").value;
    this.consume(TokenType.FROM, "Expected 'from' after loop variable");
    const start = this.expression();
    this.consume(TokenType.TO, "Expected 'to' after start value");
    const end = this.expression();
    let step = null;
    if (this.match(TokenType.WITH)) {
      step = this.expression();
    }
    this.requireNewline();
    const body = this.block([TokenType.END]);
    this.consume(TokenType.END, "Expected 'end' to close 'loop'");
    return { type: 'LoopStmt', varName, start, end, step, body, line };
  }

  // while <cond>
  whileStatement() {
    const line = this.peek().line;
    this.consume(TokenType.WHILE, "Expected 'while'");
    const condition = this.expression();
    this.requireNewline();
    const body = this.block([TokenType.END]);
    this.consume(TokenType.END, "Expected 'end' to close 'while'");
    return { type: 'WhileStmt', condition, body, line };
  }

  // define <name> [with <param>, ...]
  defineStatement() {
    const line = this.peek().line;
    this.consume(TokenType.DEFINE, "Expected 'define'");
    const name = this.consumeName("Expected function name after 'define'");
    const params = [];
    if (this.match(TokenType.WITH)) {
      params.push(this.consumeName("Expected parameter name"));
      while (this.match(TokenType.COMMA)) {
        params.push(this.consumeName("Expected parameter name"));
      }
    }
    this.requireNewline();
    const body = this.block([TokenType.END]);
    this.consume(TokenType.END, "Expected 'end' to close 'define'");
    return { type: 'DefineStmt', name, params, body, line };
  }

  // call <name> [with <arg>, ...]
  callStatement() {
    const line = this.peek().line;
    this.consume(TokenType.CALL, "Expected 'call'");
    const name = this.consumeName("Expected function name after 'call'");
    const args = [];
    if (this.match(TokenType.WITH)) {
      args.push(this.expression());
      while (this.match(TokenType.COMMA)) {
        args.push(this.expression());
      }
    }
    return { type: 'CallStmt', name, args, line };
  }

  // return <expr>
  returnStatement() {
    const line = this.peek().line;
    this.consume(TokenType.RETURN, "Expected 'return'");
    let value = null;
    if (!this.check(TokenType.NEWLINE) && !this.isAtEnd()) {
      value = this.expression();
    }
    return { type: 'ReturnStmt', value, line };
  }

  // add <expr> to <list>
  addStatement() {
    const line = this.peek().line;
    this.consume(TokenType.ADD, "Expected 'add'");
    const value = this.expression();
    this.consume(TokenType.TO, "Expected 'to' after value in 'add'");
    const listName = this.consume(TokenType.IDENTIFIER, "Expected list variable name").value;
    return { type: 'AddStmt', value, listName, line };
  }

  // remove <expr> from <list>
  removeStatement() {
    const line = this.peek().line;
    this.consume(TokenType.REMOVE, "Expected 'remove'");
    const value = this.expression();
    this.consume(TokenType.FROM, "Expected 'from' after value in 'remove'");
    const listName = this.consume(TokenType.IDENTIFIER, "Expected list variable name").value;
    return { type: 'RemoveStmt', value, listName, line };
  }

  stopStatement() {
    const line = this.peek().line;
    this.consume(TokenType.STOP, "Expected 'stop'");
    return { type: 'StopStmt', line };
  }

  // ── Expressions ────────────────────────────
  expression() { return this.orExpr(); }

  orExpr() {
    let left = this.andExpr();
    while (this.check(TokenType.OR)) {
      const op = this.advance().value;
      const right = this.andExpr();
      left = { type: 'BinaryExpr', op, left, right };
    }
    return left;
  }

  andExpr() {
    let left = this.notExpr();
    while (this.check(TokenType.AND)) {
      const op = this.advance().value;
      const right = this.notExpr();
      left = { type: 'BinaryExpr', op, left, right };
    }
    return left;
  }

  notExpr() {
    if (this.check(TokenType.NOT)) {
      const op = this.advance().value;
      const right = this.notExpr();
      return { type: 'UnaryExpr', op, right };
    }
    return this.comparison();
  }

  comparison() {
    let left = this.addition();
    const cmpOps = [TokenType.EQ, TokenType.NEQ, TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE];
    while (this.check(...cmpOps)) {
      const op = this.advance().value;
      const right = this.addition();
      left = { type: 'BinaryExpr', op, left, right };
    }
    return left;
  }

  addition() {
    let left = this.multiplication();
    while (this.check(TokenType.PLUS, TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.multiplication();
      left = { type: 'BinaryExpr', op, left, right };
    }
    return left;
  }

  multiplication() {
    let left = this.power();
    while (this.check(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const op = this.advance().value;
      const right = this.power();
      left = { type: 'BinaryExpr', op, left, right };
    }
    return left;
  }

  power() {
    let base = this.unary();
    if (this.check(TokenType.CARET)) {
      this.advance();
      const exp = this.power();
      return { type: 'BinaryExpr', op: '^', left: base, right: exp };
    }
    return base;
  }

  unary() {
    if (this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.unary();
      return { type: 'UnaryExpr', op, right };
    }
    return this.builtinExpr();
  }

  // Built-in "X of Y" operations
  builtinExpr() {
    const builtinOps = ['length', 'uppercase', 'lowercase', 'type', 'floor', 'ceil', 'round',
      'abs', 'sqrt', 'random', 'first', 'last', 'reverse', 'sorted', 'sum', 'string', 'number', 'join'];
    if (this.check(TokenType.IDENTIFIER) && builtinOps.includes(this.peek().value.toLowerCase())) {
      // peek ahead: if next is 'of' then it's a builtin
      if (this.peek(1) && this.peek(1).type === TokenType.OF) {
        const op = this.advance().value.toLowerCase();
        this.consume(TokenType.OF, `Expected 'of' after '${op}'`);
        const arg = this.unary();  // allow -N, not N (was: postfix)
        return { type: 'BuiltinExpr', op, arg };
      }
    }
    // Also handle keywords used as builtin names
    if (this.check(TokenType.LIST) && this.peek(1) && this.peek(1).type === TokenType.OF) {
      this.advance(); const op = 'length';
      this.consume(TokenType.OF, "Expected 'of'");
      const arg = this.unary();
      return { type: 'BuiltinExpr', op, arg };
    }
    return this.postfix();
  }

  postfix() {
    let expr = this.primary();
    while (true) {
      if (this.check(TokenType.DOT)) {
        this.advance();
        const prop = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'").value;
        expr = { type: 'MemberExpr', object: expr, prop };
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const index = this.expression();
        this.consume(TokenType.RBRACKET, "Expected ']'");
        expr = { type: 'IndexExpr', object: expr, index };
      } else {
        break;
      }
    }
    return expr;
  }

  primary() {
    const tok = this.peek();

    if (tok.type === TokenType.NUMBER) { this.advance(); return { type: 'Literal', value: tok.value }; }
    if (tok.type === TokenType.STRING) { this.advance(); return { type: 'Literal', value: tok.value }; }
    if (tok.type === TokenType.BOOL)   { this.advance(); return { type: 'Literal', value: tok.value }; }
    if (tok.type === TokenType.NULL)   { this.advance(); return { type: 'Literal', value: null }; }

    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      // Function call expression: name with arg1, arg2
      if (this.check(TokenType.WITH)) {
        const args = [];
        this.advance();
        args.push(this.expression());
        while (this.match(TokenType.COMMA)) args.push(this.expression());
        return { type: 'CallExpr', name: tok.value, args };
      }
      return { type: 'Identifier', name: tok.value, line: tok.line };
    }

    if (tok.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    // list literal: list 1, 2, 3
    if (tok.type === TokenType.LIST) {
      this.advance();
      const items = [];
      if (!this.check(TokenType.NEWLINE) && !this.isAtEnd()) {
        items.push(this.expression());
        while (this.match(TokenType.COMMA)) {
          if (this.check(TokenType.NEWLINE) || this.isAtEnd()) break;
          items.push(this.expression());
        }
      }
      return { type: 'ListExpr', items };
    }

    // Allow any keyword to be used as a function name in expression context
    // e.g. `say add with 10, 25` where `add` is a user-defined function
    if (tok.type !== TokenType.EOF && tok.type !== TokenType.NEWLINE &&
        tok.type !== TokenType.RPAREN && tok.type !== TokenType.RBRACKET &&
        tok.type !== TokenType.COMMA) {
      // If next token is WITH → function call expression using a keyword name
      if (this.peek(1) && this.peek(1).type === TokenType.WITH) {
        const name = typeof tok.value === 'string' ? tok.value : tok.type.toLowerCase();
        this.advance(); // consume keyword
        this.advance(); // consume 'with'
        const args = [];
        args.push(this.expression());
        while (this.match(TokenType.COMMA)) args.push(this.expression());
        return { type: 'CallExpr', name, args };
      }
      // Otherwise treat keyword as a variable name (user shadow-named a keyword)
      const name = typeof tok.value === 'string' ? tok.value : tok.type.toLowerCase();
      this.advance();
      return { type: 'Identifier', name, line: tok.line };
    }

    throw new ParseError(
      `Unexpected token '${tok.value ?? tok.type}' on line ${tok.line}. Check your syntax!`,
      tok.line
    );
  }
}

if (typeof module !== 'undefined') module.exports = { Parser, ParseError };
if (typeof globalThis !== 'undefined') {
  globalThis.Parser = Parser;
  globalThis.ParseError = ParseError;
}
})(__EASYLANG_TOKEN_TYPE);
