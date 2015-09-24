var mp = (function minorplanets () {
    var then;                               // Used for animation
    var canvas, ctx, scoreboard, scx;       // Canvases & associated contexts
    var col1X, col2X, midX, midY, lead;     // Text-positioning stuff

    // Game state
    var keysToCapture, keysDown;                    
    var lives, level, score;
    var ship, torpedoes, asteroids, fragments;
    var gameOverTime;

    ////////////////////////////////////////////////////////////////////////////
    // Utilities
    ////////////////////////////////////////////////////////////////////////////

    // Some handy aliases
    var PI = Math.PI, cos = Math.cos, sin = Math.sin;
    var max = Math.max, min = Math.min;

    var square = function (x) { return x*x; };

    // Return random number >= from & < to
    var rand = function (from, to) {
        return Math.random() * (to - from) + from;
    };

    // Do n modulo m (JavaScript's % operator isn't a true modulo)
    var mod = function (n, m) { return ((n % m) + m) % m; };

    // Sum angles x and y, both in radians, without going below 0 or over PI*2
    var sumAngles = function (x, y) { return mod(x + y, PI*2); };

    var sumVelocities = function (v1, v2) {
        var x, y;
        x = v1.speed*cos(v1.angle) + v2.speed*cos(v2.angle);
        y = v1.speed*sin(v1.angle) + v2.speed*sin(v2.angle);
        return {
            speed: Math.sqrt(x*x + y*y),
            angle: Math.atan2(y, x)
        };
    };

    // Return copy of array with element removed
    var remove = function (array, element) {
        array.filter(function (el) {return el != element;});
    };

    ////////////////////////////////////////////////////////////////////////////
    // Outline transformations (outline is array of objects like {x: 0, y: 0})
    ////////////////////////////////////////////////////////////////////////////

    // Rotate outline by rotation radians about origin
    var rotate = function (outline, rotation, origin) {
        origin = origin || {x: 0, y: 0};
        return outline.map(function (point) {
            var dx = point.x - origin.x;
            var dy = point.y - origin.y;
            return {
                x: origin.x + dx * cos(rotation) + dy * -sin(rotation),
                y: origin.y + dx * sin(rotation) + dy *  cos(rotation)
            };
        });
    };

    // Move all points by given multiplication factor from origin
    var scale = function (outline, factor, origin) {
        origin = origin || {x: 0, y: 0};
        return outline.map(function (point) {
            return {
                x: (point.x - origin.x) * factor + origin.x,
                y: (point.y - origin.y) * factor + origin.y
            };
        });
    };

    // Move outline horizontally by dx and vertically by dy
    var translate = function (outline, dx, dy) {
        return outline.map(function (point) {
            return {
                x: point.x + dx,
                y: point.y + dy
            };
        });
    };

    ////////////////////////////////////////////////////////////////////////////
    // Canvas graphics
    ////////////////////////////////////////////////////////////////////////////

    var draw = function (outline, context) {
        context = context || ctx;

        context.beginPath();
        context.moveTo(outline[0].x, outline[0].y);
        for (var i = 1; i < outline.length; i++) {
            context.lineTo(outline[i].x, outline[i].y);
        }
        context.closePath();
        context.stroke();
    };

    var write = function (fontSize, text, x, y, context) {
        context = context || ctx;

        context.font = fontSize + "px monospace";
        context.strokeText(text, x, y);
    };

    ////////////////////////////////////////////////////////////////////////////
    // Types
    ////////////////////////////////////////////////////////////////////////////

    //--------------------------------------------------------------------------
    // SpatialHash
    //--------------------------------------------------------------------------
    var SpatialHash = function () {
        this.cellSize = SpatialHash.cellSize;
        this.hash = {};
    };

    SpatialHash.prototype.insert = function (sprite) {
        var keys = this.keys(sprite);
        var key;

        for (var i in keys) {
            key = keys[i];
            if (this.hash[key] instanceof Array) {
                this.hash[key].push(sprite);
            } else {
                this.hash[key] = [sprite];
            }
        }
    };

    SpatialHash.prototype.remove = function (sprite) {
        var keys = this.keys(sprite);
        var key;

        for (var i in keys) {
            key = keys[i];
            if (this.hash[key] instanceof Array) {
                this.hash[key] = remove(this.hash[key], sprite);
            }
        }
    };

    SpatialHash.prototype.key = function (x, y) {
        var x = Math.floor(mod(x, canvas.width ) / this.cellSize)*this.cellSize;
        var y = Math.floor(mod(y, canvas.height) / this.cellSize)*this.cellSize;
        
        return x.toString() + ":" + y.toString();
    };

    SpatialHash.prototype.keys = function (sprite) {
        var minX = sprite.position.x - sprite.radius;
        var maxX = sprite.position.x + sprite.radius;
        var minY = sprite.position.y - sprite.radius;
        var maxY = sprite.position.y + sprite.radius;
        var keys = [];

        for (var x = minX; x < maxX + this.cellSize; x += this.cellSize) {
            for (var y = minY; y < maxY + this.cellSize; y += this.cellSize) {
                key = this.key(min(x, maxX), min(y, maxY));
                if (keys.indexOf(key) === -1) {
                    keys.push(key);
                }
            }
        }
        return keys;
    };

    //--------------------------------------------------------------------------
    // Sprite: common prototype for ship, asteroids, torpedoes, etc.
    //--------------------------------------------------------------------------
    var Sprite = function () {
        // Dummy values for form
        this.anglrSpeed = 0;
        this.position = {x: 0, y: 0};
        this.radius = 1;
        this.orientation = 0;
        this.outline = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
        this.velocity = {speed: 0, angle: 0};
    };

    Sprite.prototype.collidedWith = function (otherThing) {
        var dx = this.position.x - otherThing.position.x;
        var dy = this.position.y - otherThing.position.y;
        // TODO: add SAT-based narrow-phase detection collision
        return square(this.radius + otherThing.radius) >=
            square(dx) + square(dy);
    };

    Sprite.prototype.draw = function () {
        // Does it overlap an edge or edges?
        var farLeft = this.position.x < this.radius;
        var farRight = this.position.x > canvas.width - this.radius;
        var farUp = this.position.y < this.radius;
        var farDown = this.position.y > canvas.height - this.radius;

        draw(this.outline);

        // If it overlaps an edge, draw it again on the opposite edge
        if (farLeft) {
            draw(translate(this.outline, canvas.width, 0));
        } else if (farRight) {
            draw(translate(this.outline, -canvas.width, 0));
        }

        if (farUp) {
            draw(translate(this.outline, 0, canvas.height));
        } else if (farDown) {
            draw(translate(this.outline, 0, -canvas.height));
        }

        // If it overlaps a corner, draw it again in the opposite corner
        if (farLeft && farUp) {
            draw(translate(this.outline, canvas.width, canvas.height));
        } else if (farLeft && farDown) {
            draw(translate(this.outline, canvas.width, -canvas.height));
        } else if (farRight && farUp) {
            draw(translate(this.outline, -canvas.width, canvas.height));
        } else if (farRight && farDown) {
            draw(translate(this.outline, -canvas.width, -canvas.height));
        }

    };

    // Moves sprite both forward and rotationally
    Sprite.prototype.move = function (seconds) {
        var x = this.position.x;
        var y = this.position.y;
        var distance = this.velocity.speed * seconds;
        var angle = this.velocity.angle;

        var dx = mod(x + distance * cos(angle), canvas.width) - x;
        var dy = mod(y + distance * sin(angle), canvas.height) - y;
        var rotation = this.anglrSpeed * seconds;

        this.rotate(rotation);
        this.translate(dx, dy);
    };

    Sprite.prototype.rotate = function (rotation) {
        this.orientation = sumAngles(this.orientation, rotation);
        this.outline = rotate(this.outline, rotation, this.position); 
    };

    Sprite.prototype.translate = function (dx, dy) {
        this.position.x += dx;
        this.position.y += dy;
        this.outline = translate(this.outline, dx, dy);
    };

    //--------------------------------------------------------------------------
    // Ship
    //--------------------------------------------------------------------------
    var Ship = function () {
        this.anglrSpeed = 0;
        this.orientation = Ship.initialOrientation;
        this.position = {
            x: Ship.initialPosition.x,
            y: Ship.initialPosition.y
        };
        this.radius = Ship.radius;
        this.timeToNextTorpedo = 0;
        this.velocity = {speed: 0, angle: this.orientation};

        this.outline = translate(Ship.outline,
                this.position.x, this.position.y);
        this.outline = scale(this.outline, this.radius, this.position);
        this.outline = rotate(this.outline, this.orientation, this.position);
    };

    Ship.prototype = new Sprite();

    Ship.prototype.anglrDrag = function (seconds) {
        var delta = Ship.anglrDrag * seconds;

        if (this.anglrSpeed > 0) {
            this.anglrSpeed = max(this.anglrSpeed - delta, 0);
        } else if (this.anglrSpeed < 0) {
            this.anglrSpeed = min(this.anglrSpeed + delta, 0);
        }
    };

    Ship.prototype.destroy = function () {
        lives--;
        ship = null;
        (new Audio(Ship.explosionSound)).play();
        Fragment.generate(this.position,
                rand(Ship.minFragments, Ship.maxFragments));
    };

    Ship.prototype.drag = function (seconds) {
        this.velocity.speed = max(this.velocity.speed - Ship.drag*seconds, 0);
    };

    Ship.prototype.fire = function (seconds) {
        if (this.timeToNextTorpedo <= 0) {
            torpedoes.push(new Torpedo(this));
            (new Audio(Torpedo.sound)).play();
            this.timeToNextTorpedo = Ship.timeBetweentorpedoes;
        }
    };

    Ship.prototype.spin = function (seconds, direction) {
        var delta = Ship.anglrAccel * seconds;

        if (direction === "left") {
            this.anglrSpeed = max(this.anglrSpeed - delta,
                    -Ship.maxAbsAnglrSpeed);
        } else if (direction === "right") {
            this.anglrSpeed = min(this.anglrSpeed + delta,
                    Ship.maxAbsAnglrSpeed);
        }
    };

    Ship.prototype.thrust = function (seconds) {
        this.velocity = sumVelocities(this.velocity,
                {speed: Ship.acceleration * seconds, angle: this.orientation});

        this.velocity.speed = min(this.velocity.speed, Ship.maxSpeed);
    };

    Ship.prototype.update = function (seconds) {
        this.timeToNextTorpedo = max(this.timeToNextTorpedo - seconds, 0);

        if (" " in keysDown) {
            this.fire(seconds);
        }

        if ("ArrowUp" in keysDown) {
            this.thrust(seconds);
        } else {
            this.drag(seconds);
        }

        if (("ArrowLeft" in keysDown) && !("ArrowRight" in keysDown)) {
            this.spin(seconds, "left");
        } else if (("ArrowRight" in keysDown) && !("ArrowLeft" in keysDown)) {
            this.spin(seconds, "right");
        } else {
            this.anglrDrag(seconds, "none");
        }

        this.move(seconds);
    };

    //--------------------------------------------------------------------------
    // Asteroid
    //--------------------------------------------------------------------------
    var Asteroid = function (size, x, y, angle) {
        var that = this;

        this.anglrSpeed = rand(-Asteroid.maxAbsAnglrSpeed,
                Asteroid.maxAbsAnglrSpeed);
        this.radius = Asteroid.sizes[size].radius;
        this.position = {x: x, y: y};
        this.size = size;
        this.velocity = {speed: Asteroid.sizes[size].speed, angle: angle};

        this.outline = (function () {
            var outline = [];
            var noOfVertices = rand(Asteroid.minVertices, Asteroid.maxVertices);
            var theta = PI*2 / noOfVertices;
            var distance, angle;
            for (var i = 0; i < noOfVertices; i++) {
                distance = rand(that.radius, that.radius/2);
                angle = theta * rand(i - 1/2, i + 1/2);
                outline[i] = {
                    x: that.position.x + distance * cos(angle),
                    y: that.position.y + distance * sin(angle)
                };
            }
            return outline;
        })();
    };

    Asteroid.prototype = new Sprite();

    Asteroid.prototype.destroy = function () {
        var that = this;
        var x = this.position.x;
        var y = this.position.y;
        var angle1 = sumAngles(this.velocity.angle, -PI/4);
        var angle2 = sumAngles(this.velocity.angle, PI/4);

        if (this.size === "big") {
            asteroids.push(new Asteroid("medium", x, y, angle1));
            asteroids.push(new Asteroid("medium", x, y, angle2));
        } else if (this.size === "medium") {
            asteroids.push(new Asteroid("small", x, y, angle1));
            asteroids.push(new Asteroid("small", x, y, angle2));
        } else {
            this.explode();
        }

        score += Asteroid.sizes[this.size].score;

        asteroids = asteroids.filter(function (el) {return el !== that;});
    };

    Asteroid.prototype.explode = function () {
        (new Audio(Asteroid.explosionSound)).play();
        Fragment.generate(this.position,
                rand(Asteroid.minFragments, Asteroid.maxFragments));
    };

    Asteroid.prototype.update = function (seconds) {
        this.move(seconds);
    };

    Asteroid.generate = function (qty) {
        // Creates a bunch of large asteroids for a new level
        // and for the title screen
        var x, y, angle;
        var someAsteroids = [];

        for (var i = 0; i < qty; i++) {
            if (Math.random() < 0.5) {
                x = 0;
                y = Math.random() * canvas.height;
            } else {
                x = Math.random() * canvas.width;
                y = 0;
            }

            angle = Math.random() * PI*2;
            someAsteroids.push(new Asteroid("big", x, y, angle));
        }
        return someAsteroids;
    };

    //--------------------------------------------------------------------------
    // Torpedo
    //--------------------------------------------------------------------------
    var Torpedo = function (ship) {
        this.anglrSpeed = 0;
        this.orientation = ship.orientation;
        this.position = {
            x: ship.position.x + ship.radius*cos(ship.orientation),
            y: ship.position.y + ship.radius*sin(ship.orientation)
        };
        this.radius = Torpedo.radius;
        this.timeToLive = Torpedo.timeToLive;
        this.velocity = sumVelocities(ship.velocity,
                {speed: Torpedo.speed, angle: ship.orientation});

        this.outline = translate(Torpedo.outline,
                this.position.x, this.position.y);
        this.outline = scale(this.outline, this.radius, this.position);
        this.outline = rotate(this.outline, this.orientation, this.position);
    };

    Torpedo.prototype = new Sprite();

    Torpedo.prototype.update = function (seconds) {
        var that = this;

        this.timeToLive -= seconds;

        if (this.timeToLive <= 0) {
            torpedoes = torpedoes.filter(function (el) {return el !== that;});
        } else {
            this.move(seconds);
        }
    };

    //--------------------------------------------------------------------------
    // Fragment: component part of explosions
    //--------------------------------------------------------------------------
    var Fragment = function (x, y) {
        this.orientation = Math.random() * PI*2;
        this.radius = Fragment.radius;
        this.position = {x: x, y: y};
        this.timeToLive = Fragment.timeToLive;
        this.velocity = {speed: Fragment.speed, angle: this.orientation};

        this.outline = translate(Fragment.outline,
                this.position.x, this.position.y);
        this.outline = scale(this.outline, this.radius, this.position);
        this.outline = rotate(this.outline, this.orientation, this.position);
    };

    Fragment.prototype = new Sprite();

    Fragment.prototype.update = function (seconds) {
        var that = this;

        this.timeToLive -= seconds;

        if (this.timeToLive <= 0) {
            fragments = fragments.filter(function (el) {return el !== that;});
        } else {
            this.move(seconds);
        }
    };

    Fragment.generate = function (position, qty) {
        // Creates a bunch of fragments for use in explosions

        for (var i = 0; i < qty; i++) {
            fragments.push(new Fragment(position.x, position.y));
        }
    };

    ////////////////////////////////////////////////////////////////////////////
    // Game play
    ////////////////////////////////////////////////////////////////////////////

    // This is where we start, and where we return to between games
    var betweenGames = function () {
        ship = null;
        asteroids = Asteroid.generate(Asteroid.baseQty);
        torpedoes = [];
        fragments = [];
        titleScreen(performance.now());
    };

    var titleScreen = function (now) {
        var seconds;

        then = then || now;
        seconds = (now - then) / 1000;
        then = now;

        update(seconds);
        render();

        if (gameOverTime > 0) {
            write(48, "game over",                     midX, midY - lead*7);
            write(24, "press enter to play again",     midX, midY + lead*7);
            gameOverTime -= seconds;
        } else {
            write(48, "minor planets",                 midX, midY - lead*7);
            write(18, "© 2015 d.g.h. franey",          midX, midY - lead*4);
            write(18, "sound effects by mike koening", midX, midY + lead*5);
            write(24, "press enter to start",          midX, midY + lead*7);

            write(18, "thrust",     col1X, midY - lead*2);
            write(18, "↑",          col2X, midY - lead*2);
            write(18, "spin left",  col1X, midY - lead);
            write(18, "←",          col2X, midY - lead);
            write(18, "spin right", col1X, midY);
            write(18, "→",          col2X, midY);
            write(18, "fire",       col1X, midY + lead);
            write(18, "space",    col2X, midY + lead);
            write(18, "pause",      col1X, midY + lead*2);
            write(18, "p",          col2X, midY + lead*2);
        }

        if ("Enter" in keysDown) {
            startGame();
        } else {
            requestAnimationFrame(titleScreen);
        };
    };

    var startGame = function () {
        lives = 3;
        level = 0;
        score = 0;

        startLife();
    };

    var startLife = function () {
        ship = new Ship();
        torpedoes = [];
        startLevel();
    };

    var startLevel = function () {
        asteroids = Asteroid.generate(Asteroid.baseQty + level);
        fragments = [];
        play(performance.now());
    };

    // Main game loop
    var play = function (now) {
        var seconds;
        var oldScore = score;

        then = then || now;
        seconds = (now - then) / 1000;
        then = now;

        update(seconds);
        checkCollisions();
        render();

        // Get a new life every Ship.newLifeScore points
        if (Math.floor(score/Ship.newLifeScore) >
                Math.floor(oldScore/Ship.newLifeScore) &&
                lives < 12) {
            lives++;
        }
        // If ship is destroyed, wait till explosion dies away, and ...
        if (!ship && fragments.length === 0) {
            // ... start another life if there are any left ...
            if (lives >= 0) {
                startLife();
            // ... or end the game if not.
            } else {
                gameOver();
            }
        // If the last asteroid has been destroyed, wait till the explosion has
        // died away, and then start the next level
        } else if (asteroids.length === 0 && fragments.length === 0) {
            level++;
            startLevel();
        } else if ("p" in keysDown) {
            requestAnimationFrame(pause);
        } else {
            requestAnimationFrame(play);
        }
    };

    // Update sprites
    var update = function (seconds) {
        asteroids.map(function (a) {a.update(seconds);});
        fragments.map(function (t) {t.update(seconds);});
        torpedoes.map(function (t) {t.update(seconds);});

        if (ship) {
            ship.update(seconds);
        }
    };

    // See if anything's hit anything else
    var checkCollisions = function () {
        var spHash, i, j, k, keys, asts;

        // spatially hash asteroids
        spHash = new SpatialHash();

        for (i in asteroids) {
            spHash.insert(asteroids[i]);
        }

        nextTorpedo: for (i in torpedoes) {
            keys = spHash.keys(torpedoes[i]);
            for (j in keys) {
                asts = spHash.hash[keys[j]];
                for (k in asts) {
                    if (torpedoes[i].collidedWith(asts[k])) {
                        asts[k].destroy();
                        torpedoes = torpedoes.filter(function (el)
                                {return el !== torpedoes[i];});
                        break nextTorpedo;
                    }
                }
            }
        }

        if (ship) {
            keys = spHash.keys(ship);
            ship: for (i in keys) {
                asts = spHash.hash[keys[i]];
                for (j in asts) {
                    if (ship.collidedWith(asts[j])) {
                        ship.destroy();
                        break ship;
                    }
                }
            }
        }

    };

    // Draw everything
    var render = function () {
        // Clear main canvas and the scoreboard
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        scx.fillRect(0, 0, scoreboard.width, scoreboard.height);

        // Draw all sprites
        asteroids.map(function (a) {a.draw();});
        torpedoes.map(function (t) {t.draw();});
        fragments.map(function (t) {t.draw();});
        if (ship) {
            ship.draw();
        }

        // Refresh the scoreboard
        for (var i = 0; i < lives; i++) {
            draw(translate(Ship.lifeIcon, 32*i + 16, scoreboard.height/2), scx);
        }
        if (score >= 0) {
            write(24, score, scoreboard.width-16, scoreboard.height/2, scx);
        }
    };

    var pause = function (now) {
        then = null;

        render();
        write(48, "paused",                midX, midY - lead*7);
        write(24, "press enter to resume", midX, midY + lead*7);

        if ("Enter" in keysDown) {
            requestAnimationFrame(play);
        } else {
            requestAnimationFrame(pause);
        }
    };

    var gameOver = function () {
        gameOverTime = 30;
        betweenGames();
    };

    ////////////////////////////////////////////////////////////////////////////
    // Initial set-up
    ////////////////////////////////////////////////////////////////////////////

    // Run once on load: basic set-up
    var init = function () {

        // Canvas (and context) for main playing area
        canvas = document.getElementById("main-canvas");

        ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "GhostWhite";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = ctx.shadowColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "hanging";

        scoreboard = document.getElementById("score-canvas");

        // Ditto for scoreboard
        scx = scoreboard.getContext("2d");
        scx.fillStyle = ctx.fillStyle;
        scx.lineWidth = ctx.lineWidth;
        scx.shadowBlur = ctx.shadowBlur;
        scx.shadowColor = ctx.shadowColor;
        scx.shadowOffsetX = ctx.shadowOffsetX;
        scx.shadowOffsetY = ctx.shadowOffsetY;
        scx.strokeStyle = ctx.strokeStyle;
        scx.textAlign = "right";
        scx.textBaseline = "middle";

        // Stuff for positioning text
        col1X = canvas.width*3/8;
        col2X = canvas.width*5/8;
        midX = canvas.width/2;
        midY = canvas.height/2;
        lead = 24;  // line-height

        // Key capture
        keysToCapture = {
            13: "Enter",
            32: " ",
            37: "ArrowLeft",
            38: "ArrowUp",
            39: "ArrowRight",
            80: "p"
        };
        keysDown = {};

        addEventListener("keydown", function (e) {
            var key = e.key || keysToCapture[e.keyCode];

            if (e.keyCode in keysToCapture) {
                e.preventDefault();
            }

            if (key) {
                keysDown[key] = true;
            }
        }, false);

        addEventListener("keyup", function (e) {
            var key = e.key || keysToCapture[e.keyCode];

            if (key) {
                delete keysDown[key];
            }
        }, false);

        // Initialise our arrays of sprites
        asteroids = [];
        torpedoes = [];
        fragments = [];

        // Sprite-specific settings, put in one place for ease of fiddling
        Asteroid.baseQty = 4;       // starting number of asteroids on level 0
        Asteroid.explosionSound = "audio/explosion.wav";
        Asteroid.maxAbsAnglrSpeed = PI;
        Asteroid.maxFragments = 5;
        Asteroid.maxVertices = 12;
        Asteroid.minFragments = 10;
        Asteroid.minVertices = 6;
        Asteroid.sizes = {
            "big":    {radius: 64, speed:  64, score:  20},
            "medium": {radius: 32, speed:  96, score:  50},
            "small":  {radius: 16, speed: 128, score: 100}
        };
        Fragment.outline = [
                {x:  0, y: -1},
                {x:  1, y:  0},
                {x:  0, y:  1},
                {x: -1, y:  0}
        ];
        Fragment.radius = 2;
        Fragment.speed = 128;
        Fragment.timeToLive = 2;
        Torpedo.outline = [
                {x:  0, y: -1},
                {x:  1, y:  0},
                {x:  0, y:  1},
                {x: -1, y:  0}
        ];
        Ship.acceleration = 512;            // in pixels per second per second
        Ship.anglrAccel = PI*4;             // in radians per second per second
        Ship.anglrDrag = Infinity;          // in radians per second per second
        Ship.drag = 512;                    // in pixels per second per second
        Ship.explosionSound = "audio/explosion.wav";
        Ship.initialOrientation = -PI/2;     // in radians
        Ship.initialPosition = {
                x: canvas.width/2,
                y: canvas.height/2
        };
        Ship.maxAbsAnglrSpeed = PI*2;       // in radians per second
        Ship.maxFragments = 60;
        Ship.maxSpeed = 512;                // in pixels per second
        Ship.minFragments = 50;
        Ship.newLifeScore = 10000;          // new life every this many points
        Ship.radius = 16;                   // in pixels
        Ship.outline = [
            {x: cos(0),      y: sin(0)     },
            {x: cos(PI*3/4), y: sin(PI*3/4)},
            {x: 0,           y: 0          },
            {x: cos(PI*5/4), y: sin(PI*5/4)}
        ];
        Ship.lifeIcon = rotate(scale(Ship.outline, Ship.radius),
                Ship.initialOrientation); 
        Ship.timeBetweentorpedoes = 0.2;    // in seconds
        SpatialHash.cellSize = Ship.radius * 4;
        Torpedo.radius = 1;     // in pixels
        Torpedo.sound = "audio/torpedo.wav";
        Torpedo.speed = 256;    // in pixels per second
        Torpedo.timeToLive = 1; // in seconds
    };

    return {
        SpatialHash: SpatialHash,
        run: function () {
                init();
                betweenGames();
        }
    };
})();
mp.run();
