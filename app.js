'use strict';

define('app', ['jquery', 'graph', 'user', 'storage'], function($, Graph, User, storage) {
    /** @class App */

    /**
     * @constructor
     * @param {Object} options
     */
    var App = function(options) {
        var defaults = {
            // частота опроса
            sampleRate: 650,
            // тестовый режим
            testMode: false
        };

        this.options = $.extend(defaults, options);

        // очередь
        this.queue = [];

        // флаг остановки
        this.isStoped = false;

        this.nTicks = 0;
    };

    /**
     * @param {Array} initUsers
     */
    App.prototype.init = function(initUsers) {
        var app = this,
            $body = $(document.body),
            w = 1200,
            h = 800,
            $canvas = $('<div id="canvas" style="margin: 0 auto;"></div>')
                .css('width', w + 'px')
                .css('height', h + 'px'),
            $controls = $('<div id="controls"></div>');

        $('<button id="btn-stop">stop</button>')
            .appendTo($controls)
            .on('click', function() {
                app.isStoped = true;
                return false;
            });

        $body
            // элементы управления
            .append($controls)
            // и подготовим холст
            .append($canvas);

        var root = new User('НЛО', '/');
        root.avatar = '/favicon.ico';

        app.queue = [];
        app.graph = new Graph($canvas.get(0), {w:w, h:h});
        app.addToGraph(root, 40, {fill: '#959595'});

        for(var i = 0, l = initUsers.length; i < l; i++) {
            app.queue.push(initUsers[i]);
            app.addToGraph(initUsers[i]);
        }

        app.graph.update();

        if(app.options.testMode) {
            app.linkUsers(root, initUsers[0]);
            app.linkUsers(initUsers[0], initUsers[1]);
            app.graph.update();

            return;
        }

        // start loop
        app.tick();
    };

    /**
     */
    App.prototype.tick = function() {
        var app = this;
        app.nTicks++;

        var user = app.queue.shift();
        if(user === undefined) {
            return;
        }

        console.log('Request for ' + user.nickname);
        app.requestUser(user).then(function(user) {
            var node = app.addToGraph(user),
                parentNode = app.findNode(user.invitedBy);

            console.log(user);

            if(parentNode !== null) {
                app.graph.linkNodes(node, parentNode).update();
            }
            else {
                app.addToQueue(user.invitedBy, 'high');
            }

            user.friends.forEach(function(f) {
                var friendNode = app.findNode(f);

                if(friendNode !== null) {
                    app.graph.linkNodes(friendNode, node).update();
                }
                else {
                    app.addToQueue(f, 'low');
                }
            });

            var nextThrough = user.__storage ? 150 : app.options.sampleRate;
            setTimeout(function() {
                app.tick();
            }, nextThrough)
        });
    };

    /**
     * @param {User} user
     */
    App.prototype.requestUser = function(user) {
        // кеш
        var cachedValue = storage.load(user.nickname, 'user.');

        var d = $.Deferred();
        if(cachedValue !== null) {
            cachedValue.__storage = true;
            d.resolve(cachedValue);
            console.log('loaded from cache');
        }
        else {
            // получаем информацию о пользователе
            $.get(user.url, function(response) {
                var $page = $(response),
                    $invitedBy = $('#invited-by', $page),
                    invitedByName = '',
                    invitedByUrl = '';

                if($invitedBy.length === 0) {
                    // наверное НЛО
                    invitedByName = 'НЛО';
                }
                else {
                    invitedByName = $invitedBy.text().trim() || null;
                    invitedByUrl = $invitedBy.attr('href') || null;
                }

                var invitedByUser = new User(invitedByName, invitedByUrl);

                user.avatar = $('.user_header .avatar img', $page).attr('src');
                user.invitedBy = invitedByUser;

                // друзьяши, куда без них
                var $friends = $('#invited_data_items li a[rel="friend"]', $page);
                user.friends = $friends.map(function() {
                    var $friend = $(this),
                        friendName = $friend.text().trim(),
                        friendUrl = $friend.attr('href');

                    return new User(friendName, friendUrl);
                }).get();

                storage.save(user.nickname, user, 'user.');
                console.log('saved to cache');
                d.resolve(user);
            });
        }

        return d.promise();
    };

    /**
     * @param {User} user
     * @param {?string} priority
     */
    App.prototype.addToQueue = function(user, priority) {
        priority = priority || 'low';
        if(priority === 'high') {
            this.queue.unshift(user);
        }
        else {
            this.queue.push(user);
        }
    };

    /**
     * @param {User} user
     * @param {?int} size
     * @param {?Object} options
     */
    App.prototype.addToGraph = function(user, size, options) {
        size = size || user.friends.length;
        options = options || {};
        return this.graph.add(user.nickname, size, options);
    };


    /**
     * @param {User} user1
     * @param {User} user2
     */
    App.prototype.linkUsers = function(user1, user2) {
        var node1 = this.findNode(user1),
            node2 = this.findNode(user2);

        if(node1 && node2) {
            this.graph.linkNodes(node1, node2);
        }
    };

    /**
     * @param {User} user
     */
    App.prototype.findNode = function(user) {
        return this.graph.find(user.nickname);
    };

    return App;
});