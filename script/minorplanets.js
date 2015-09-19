var then, requestID;    // used for animation
var canvas, ctx;
var keysDown;
var paused;
var lives, level, score;
var ship, torpedos, asteroids, fragments;
var gameOverTime;

// Javascript's remainder operator doesn't serve our purposes 
var mod = function (n, m) {
    return ((n % m) + m) % m;
};

var displacement = function (distance, angle) {
    return {
        dx: distance * Math.cos(angle),
        dy: distance * Math.sin(angle)
    };
};

var sumVelocities = function (v1, v2) {
    var x, y;
    x = v1.speed*Math.cos(v1.angle) + v2.speed*Math.cos(v2.angle);
    y = v1.speed*Math.sin(v1.angle) + v2.speed*Math.sin(v2.angle);
    return {speed: Math.sqrt(x*x + y*y), angle: Math.atan2(y, x)};
};

// Functions for manipulating and drawing outlines -- arrays of points, where
// each point is an object of the form {x: 0, y: 0}
var translate = function (outline, dx, dy) {
    return outline.map(function (point) {
        return {
            x: point.x + dx,
            y: point.y + dy
        };
    });
};

var rotate = function (outline, rotation, origin) {
    return outline.map(function (point) {
        var dx = point.x - origin.x;
        var dy = point.y - origin.y;
        var cos = Math.cos(rotation);
        var sin = Math.sin(rotation);
        return {
            x: origin.x + dx * cos + dy * -sin,
            y: origin.y + dx * sin + dy * cos
        };
    });
};

var draw = function (outline) {
    ctx.beginPath();
    ctx.moveTo(outline[0].x, outline[0].y);
    for (var i = 1; i < outline.length; i++) {
        ctx.lineTo(outline[i].x, outline[i].y);
    }
    ctx.closePath();
    ctx.stroke();
};

// Types for the things we see on screen -- the player's ship, asteroids,
// bullets etc.
var Thing = function () {
    // common prototype for all of these
    this.size = 0;
    this.position = {x: 150, y: 150};
    this.velocity = {speed: 0, angle: 0};
    this.angularSpeed = 0;
    this.orientation = 0;
    this.outline = [{x: 100, y: 100}, {x: 200, y: 100}, {x: 200, y: 200},
            {x: 100, y: 200}];
};

Thing.prototype.translate = function (dx, dy) {
    this.position.x += dx;
    this.position.y += dy;
    this.outline = translate(this.outline, dx, dy);
};

Thing.prototype.rotate = function (rotation) {
    this.orientation += rotation;
    this.outline = rotate(this.outline, rotation, this.position); 
};

// Moves thing both forward and rotationally
Thing.prototype.move = function (seconds) {
    var distance = this.velocity.speed * seconds;
    var disp = displacement(distance, this.velocity.angle);

    // we need to wrap new co-ordinates, but we also need the final
    // displacements that result from this clipping, as we're going to use them
    // again when translating the outline
    var dx = mod(this.position.x + disp.dx, canvas.width) - this.position.x;
    var dy = mod(this.position.y + disp.dy, canvas.height) - this.position.y;
    var rotation = this.angularSpeed * seconds;

    this.rotate(rotation);
    this.translate(dx, dy);
};

Thing.prototype.draw = function () {
    // does it overlap an edge or edges?
    var farLeft = this.position.x < this.size;
    var farRight = this.position.x > canvas.width - this.size;
    var farUp = this.position.y < this.size;
    var farDown = this.position.y > canvas.height - this.size;

    draw(this.outline);

    // if it overlaps an edge, draw it again on the opposite edge
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

    // if it overlaps a corner, draw it again in the opposite corner
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

Thing.prototype.collidedWith = function (otherThing) {
    var dx = this.position.x - otherThing.position.x;
    var dy = this.position.y - otherThing.position.y;
    return Math.pow(this.size + otherThing.size, 2) >= dx*dx + dy*dy;
};

var Fragment = function (x, y) {
    this.size = 2;
    this.position = {x: x, y: y};
    this.orientation = Math.random() * Math.PI * 2;
    this.velocity = {speed: 128, angle: this.orientation};
    this.outline = translate(
            [{x: 0, y: -2}, {x: 2, y: 0}, {x: 0, y: 2}, {x: -2, y: 0}],
            this.position.x, this.position.y);
    this.timeToLive = 1;
};

Fragment.prototype = new Thing();

Fragment.prototype.update = function (seconds) {
    var that = this;

    this.timeToLive -= seconds;

    if (this.timeToLive <= 0) {
        fragments = fragments.filter(function (el) {return el != that;});
    } else {
        this.move(seconds);
    }
};

Thing.prototype.explode = function () {
    (new Audio("audio/explosion.wav")).play();
    for (var i = Math.random() * 5 + 5; i > 0; i--) {
        fragments.push(new Fragment(this.position.x, this.position.y));
    }
};

var Asteroid = function (sizeClass, x, y, angle) {
    var speed;
    var that = this;

    if (sizeClass === "big") {
        this.size = 64;
        speed = 64;
    } else if (sizeClass === "medium") {
        this.size = 32;
        speed = 96;
    } else if (sizeClass === "small") {
        this.size = 16;
        speed = 128;
    }

    this.sizeClass = sizeClass;
    this.position = {x: x, y: y};
    this.velocity = {speed: speed, angle: angle};
    this.angularSpeed = Math.random() * 2 * Math.PI - Math.PI;
    this.outline = (function () {
        var outline = [];
        var noOfPoints = Math.random() * 6 + 6;
        var theta = 2 * Math.PI / noOfPoints;
        var distance, angle;
        for (var i = 0; i < noOfPoints; i++) {
            distance = (1 - Math.random() / 2) * that.size;
            angle = theta * (i + (Math.random() * 2 - 1) / 3);
            outline[i] = {
                x: that.position.x + distance * Math.cos(angle),
                y: that.position.y + distance * Math.sin(angle)
            }
        }
        return outline;
    })();
};

Asteroid.prototype = new Thing();

Asteroid.prototype.split = function () {
    var that = this;
    var x = this.position.x;
    var y = this.position.y;
    var angle1 = mod(this.velocity.angle - Math.PI/4, Math.PI*2);
    var angle2 = mod(this.velocity.angle + Math.PI/4, Math.PI*2);
    var oldScore = score;

    if (this.sizeClass === "big") {
        asteroids.push(new Asteroid("medium", x, y, angle1));
        asteroids.push(new Asteroid("medium", x, y, angle2));
        score += 20;
    } else if (this.sizeClass === "medium") {
        asteroids.push(new Asteroid("small", x, y, angle1));
        asteroids.push(new Asteroid("small", x, y, angle2));
        score += 50;
    } else {
        this.explode();
        score += 100;
    }

    if (Math.floor(score/10000) > Math.floor(oldScore/10000) && lives < 12) {
        lives++;
    }

    asteroids = asteroids.filter(function (el) {return el != that;});

};

var Torpedo = function (ship) {
    var torpedoSpeed = 256;
    this.size = 1;
    this.position = {x: ship.position.x + ship.size*Math.cos(ship.orientation),
                     y: ship.position.y + ship.size*Math.sin(ship.orientation)};
    this.orientation = ship.orientation;
    this.velocity = sumVelocities(ship.velocity,
            {speed: torpedoSpeed, angle: ship.orientation});
    this.outline = translate(
            [{x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}],
            this.position.x, this.position.y);
    this.timeToLive = 1;
};

Torpedo.prototype = new Thing();

Torpedo.prototype.update = function (seconds) {
    var that = this;

    this.timeToLive -= seconds;

    if (this.timeToLive <= 0) {
        torpedos = torpedos.filter(function (el) {return el != that;});
    } else {
        this.move(seconds);
    }
};

var Ship = function () {
    this.size = 16;
    this.position = {x: canvas.width/2, y: canvas.height/2};
    this.orientation = -Math.PI/2;
    this.velocity = {speed: 0, angle: -Math.PI/2};
    this.outline = translate([
            {x: 0, y: -this.size},
            {x: Math.cos(Math.PI/4)*this.size, y: Math.sin(Math.PI/4)*this.size},
            {x: 0, y: 0},
            {x: Math.cos(Math.PI/4)*-this.size, y: Math.sin(Math.PI/4)*this.size}
            ], this.position.x, this.position.y);
    this.timeToNextTorpedo = 0;
};

Ship.prototype = new Thing();

Ship.prototype.update = function (seconds) {
    this.timeToNextTorpedo = Math.max(this.timeToNextTorpedo - seconds, 0);
    this.move(seconds);
};

Ship.prototype.thrust = function (seconds) {
    var acceleration = 256;      // in pixels per second per second
    var maxSpeed = 512;         // in pixels per second

    this.velocity = sumVelocities(this.velocity,
            {speed: acceleration * seconds, angle: this.orientation});

    this.velocity.speed = Math.min(this.velocity.speed, maxSpeed);
};

Ship.prototype.drag = function (seconds) {
    var drag = 256;              // in pixels per second per second

    this.velocity.speed = Math.max(this.velocity.speed - drag*seconds, 0);
};

Ship.prototype.spin = function (seconds, direction) {
    var acceleration = Math.PI*4;       // in radians per second per second
    var maxAbsAngularSpeed = Math.PI*2; // in radians per second

    if (direction === "left") {
        this.angularSpeed = Math.max(this.angularSpeed - acceleration*seconds,
                -maxAbsAngularSpeed);
    } else if (direction === "right") {
        this.angularSpeed = Math.min(this.angularSpeed + acceleration*seconds,
                maxAbsAngularSpeed);
    }
};

Ship.prototype.angularDrag = function (seconds) {
    var drag = Infinity;             // in radians per second per second

    if (this.angularSpeed > 0) {
        this.angularSpeed = Math.max(this.angularSpeed - drag*seconds, 0);
    } else if (this.angularSpeed < 0) {
        this.angularSpeed = Math.min(this.angularSpeed + drag*seconds, 0);
    }
};

Ship.prototype.fire = function (seconds) {
    if (this.timeToNextTorpedo <= 0) {
        torpedos.push(new Torpedo(this));
        (new Audio("audio/torpedo.wav")).play();
        this.timeToNextTorpedo = 0.2;
    }
};

var init = function () {
    // run once on load: basic set-up
    canvas = document.createElement("canvas");
    //canvas.height = window.innerHeight * 0.95;
    //canvas.width = window.innerWidth * 0.95;
    canvas.height = 512;
    canvas.width = 768;
    document.body.appendChild(canvas);

    ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.strokeStyle = "GhostWhite";
    ctx.lineWidth = 2;
    ctx.shadowColor = "GhostWhite";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    scoreboard = document.createElement("canvas");
    scoreboard.height = 48;
    scoreboard.width = canvas.width;
    document.body.appendChild(scoreboard);

    scx = scoreboard.getContext("2d");
    scx.fillStyle = "black";
    scx.strokeStyle = "GhostWhite";
    scx.lineWidth = 2;
    scx.shadowColor = "GhostWhite";
    scx.shadowBlur = 10;
    scx.shadowOffsetX = 0;
    scx.shadowOffsetY = 0;
    scx.textAlign = "right";
    scx.textBaseline = "middle";
    scx.font = "32px monospace";

    keysDown = [];
    addEventListener("keydown", function (e) {
        keysDown[e.key] = true;
    }, false);

    addEventListener("keyup", function (e) {
        delete keysDown[e.key];
    }, false);

};

var clearCanvas = function () {
    // utility function to clear the screen before redrawing
    ctx.fillRect(0, 0, canvas.width, canvas.height);
};

var clearScoreboard = function () {
    // utility function to clear the screen before redrawing
    scx.fillRect(0, 0, scoreboard.width, scoreboard.height);
};

var refreshScoreboard = function () {
    var outline = translate([
            {x: 0, y: -16},
            {x: Math.cos(Math.PI/4)*16, y: Math.sin(Math.PI/4)*16},
            {x: 0, y: 0},
            {x: Math.cos(Math.PI/4)*-16, y: Math.sin(Math.PI/4)*16}],
            0, scoreboard.height/2+2);
    clearScoreboard();
    for (var i = 0; i < lives; i++) {
        outline = translate(outline, 32, 0);
        scx.beginPath();
        scx.moveTo(outline[0].x, outline[0].y);
        for (var j = 1; j < outline.length; j++) {
            scx.lineTo(outline[j].x, outline[j].y);
        }
        scx.closePath();
        scx.stroke();
    }
    scx.strokeText(score, scoreboard.width-16, scoreboard.height/2);
}

var makeAsteroids = function (qty) {
    // creates a bunch of large asteroids for a new level
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

        angle = Math.random() * 2 * Math.PI;
        someAsteroids.push(new Asteroid("big", x, y, angle));
    }
    return someAsteroids;
};

var pause = function () {
    then = null;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "48px monospace";
    ctx.strokeText("paused", canvas.width/2, canvas.height/4);

    if ("u" in keysDown) {
        paused = false;
    }
};

var animateGameOverScreen = function (now) {
    var seconds;
    clearCanvas();
    clearScoreboard();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "48px monospace";
    ctx.strokeText("game over", canvas.width/2, canvas.height/4);
    ctx.font = "24px monospace";
    ctx.strokeText("press enter to play again",
            canvas.width/2, canvas.height - 48);

    if (paused) {
        if ("u" in keysDown) {
            paused = false;
        }
        then = null;
    } else {
        if ("p" in keysDown) {
            paused = true;
        }
        then = then || now;
        seconds = (now - then) / 1000;
        asteroids.map(function (a) {a.move(seconds);});
        then = now;
        gameOverTime -= seconds;
    }

    asteroids.map(function (a) {a.draw();});

    if ("Enter" in keysDown) {
        newGame();
    } else if (gameOverTime < 0) {
        requestAnimationFrame(animateTitleScreen);
    } else {
        requestAnimationFrame(animateGameOverScreen);
    }
};

var gameOver = function () {
    gameOverTime = 10;
    asteroids = makeAsteroids(5);
    animateGameOverScreen(performance.now());
};

var play = function (now) {
    var seconds;
    clearCanvas();

    if (paused) {
        pause();
    } else if (!ship && fragments.length === 0) {
        if (lives >= 0) {
            newLife();
        } else {
            gameOver();
        }
        return;
    } else if (asteroids.length === 0 && fragments.length === 0) {
        level++;
        startLevel();
        return;
    } else {

        then = then || now;
        seconds = (now - then) / 1000;
        then = now;

        asteroids.map(function (a) {a.move(seconds);});
        fragments.map(function (t) {t.update(seconds);});
        torpedos.map(function (t) {t.update(seconds);});

        // check for collisions
        for (var i = 0; i < torpedos.length; i++) {
            for (var j = 0; j < asteroids.length; j++) {
                if (torpedos[i].collidedWith(asteroids[j])) {
                    asteroids[j].split();
                    torpedos = torpedos.filter(function (el)
                            {return el != torpedos[i];});
                    break;
                }
            }
        }

        if (ship) {

            ship.update(seconds);

            // react to key presses
            if ("p" in keysDown) {
                paused = true;
            }

            if (" " in keysDown) {
            ship.fire(seconds);
            }

            if ("ArrowUp" in keysDown) {
                ship.thrust(seconds);
            } else {
                ship.drag(seconds);
            }

            if (("ArrowLeft" in keysDown) && !("ArrowRight" in keysDown)) {
                ship.spin(seconds, "left");
            } else if (("ArrowRight" in keysDown) && !("ArrowLeft" in keysDown)) {
                ship.spin(seconds, "right");
            } else {
                ship.angularDrag(seconds, "none");
            }

            for (var i = 0; i < asteroids.length; i++) {
                if (ship.collidedWith(asteroids[i])) {
                    ship.explode();
                    lives--;
                    ship = null;
                    break;
                }
            }
        }

    }

    // draw everything
    asteroids.map(function (a) {a.draw();});
    torpedos.map(function (t) {t.draw();});
    fragments.map(function (t) {t.draw();});
    if (ship) {
        ship.draw();
    }
    refreshScoreboard();
    requestAnimationFrame(play);
};

var startLevel = function () {
    asteroids = makeAsteroids(4 + level);
    fragments = [];
    play(performance.now());
};

var newLife = function () {
    ship = new Ship();
    torpedos = [];
    startLevel();
};

var newGame = function () {
    // starts a new game
    lives = 3;
    level = 0;
    score = 0;

    paused = false;

    newLife();
};

var animateTitleScreen = function (now) {
    var seconds;
    clearCanvas();
    clearScoreboard();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "48px monospace";
    ctx.strokeText("minor planets", canvas.width/2, canvas.height/4);
    ctx.font = "18px monospace";
    ctx.strokeText("thrust", canvas.width*3/8, canvas.height/2 - 36);
    ctx.strokeText("spin left", canvas.width*3/8, canvas.height/2 - 12);
    ctx.strokeText("spin right", canvas.width*3/8, canvas.height/2 + 12);
    ctx.strokeText("fire", canvas.width*3/8, canvas.height/2 + 36);
    ctx.strokeText("pause", canvas.width*3/8, canvas.height/2 + 60);
    ctx.strokeText("unpause", canvas.width*3/8, canvas.height/2 + 84);
    ctx.strokeText("quit", canvas.width*3/8, canvas.height/2 + 108);
    ctx.strokeText("↑", canvas.width*5/8, canvas.height/2 - 36);
    ctx.strokeText("←", canvas.width*5/8, canvas.height/2 - 12);
    ctx.strokeText("→", canvas.width*5/8, canvas.height/2 + 12);
    ctx.strokeText("<space>", canvas.width*5/8, canvas.height/2 + 36);
    ctx.strokeText("p", canvas.width*5/8, canvas.height/2 + 60);
    ctx.strokeText("u", canvas.width*5/8, canvas.height/2 + 84);
    ctx.strokeText("q", canvas.width*5/8, canvas.height/2 + 108);
    ctx.strokeText("laser cannon sound effect by Mike Koening",
            canvas.width/2, canvas.height/2 + 156);
    ctx.font = "24px monospace";
    //ctx.strokeText("press enter to start", canvas.width/2, canvas.height*3/4);
    ctx.strokeText("press enter to start", canvas.width/2, canvas.height - 48);

    if (paused) {
        if ("u" in keysDown) {
            paused = false;
        }
        then = null;
    } else {
        if ("p" in keysDown) {
            paused = true;
        }
        then = then || now;
        seconds = (now - then) / 1000;
        asteroids.map(function (a) {a.move(seconds);});
        then = now;
    }

    asteroids.map(function (a) {a.draw();});

    if ("Enter" in keysDown) {
        newGame();
    } else {
        requestAnimationFrame(animateTitleScreen);
    };
};

var titleScreen = function () {
    asteroids = makeAsteroids(5);
    animateTitleScreen(performance.now());
};

var quitGame = function () {
    // sends back to betweenGames
};

var betweenGames = function () {
    // displays "Press a key" message over random asteroids
};

var newLevel = function () {
};

init();
titleScreen();
