Date.prototype.addHours = function (h) {
    this.setTime(this.getTime() + (h * 60 * 60 * 1000));
    return this;
}

function arrayMin(arr) {
    var len = arr.length, min = Infinity;
    while (len--) {
        if (arr[len] < min) {
            min = arr[len];
        }
    }
    return min;
};

function pad(num, size) {
    var s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
};

var categoryGraph = function (req, res, db) {
    db.query('SELECT page_title,cat_files,cl_to[0:10],cat_level[0:10] from categories', (err, dbres) => {
        if (!err) {
            var result = Object();
            result.nodes = [];
            result.edges = [];
            i = 0;
            while (i < dbres.rows.length) {
                node = Object();
                node.id = dbres.rows[i].page_title;
                node.files = dbres.rows[i].cat_files;
                node.group = arrayMin(dbres.rows[i].cat_level);
                j = 0;
                while (j < dbres.rows[i].cl_to.length) {
                    edge = Object();
                    edge.target = dbres.rows[i].cl_to[j];
                    edge.source = dbres.rows[i].page_title;
                    if (edge.target != "ROOT")
                        result.edges[result.edges.length] = edge;
                    j++;
                }
                result.nodes[i] = node;

                i++;
            }
            res.json(result);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    })
}

var index = function (req, res, glams) {
    let result = [];

    for (var id in glams) {
        if (!glams.hasOwnProperty(id))
            continue;

        let glam = {
            'name': glams[id]['name'],
            'fullname': glams[id]['fullname'],
            'category': "Category:" + glams[id]['category'],
            'image': glams[id]['image']
        };
        result.push(glam);
    }
    res.json(result);
}

var rootCategory = function (req, res, cat) {
    cat.connection.query('SELECT page_title from categories limit 1', (err, dbres) => {
        if (!err) {
            let result = {};
            result.name = cat.fullname;
            result.category = 'Category:' + cat.category;
            res.json(result);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    })
}

var totalMediaNum = function (req, res, db) {
    db.query('SELECT COUNT(*) as num from images', (err, dbres) => {
        if (!err) {
            res.json(dbres.rows[0]);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    })
}

// USER CONTRIBUTIONS
var uploadDate = function (req, res, start, end, db) {
    query = `select count(*) as img_count, img_user_text, to_char(img_timestamp, \'YYYY/MM\') as img_time
             from images`;

    //start and end are defined, convert them to timestamp and append
    if (start !== undefined) {
        splitted = start.split('/');
        start_timestamp = "'" + splitted[0] + "-" + splitted[1] + "-1 00:00:00'";
        query += " where img_timestamp>=" + start_timestamp;
    }
    if (end !== undefined) {
        splitted = end.split('/');
        end_timestamp = "'" + splitted[0] + "-" + splitted[1] + "-1 00:00:00'";
        if (start == undefined)
            query += " where ";
        else
            query += " and ";
        query += "img_timestamp<=" + end_timestamp;
    }
    query += " group by img_user_text, img_time order by img_user_text limit 1000";

    db.query(query, (err, dbres) => {
        if (!err) {
            result = new Object();
            result.users = [];
            i = 0;
            while (i < dbres.rows.length) {
                user = Object();
                user.user = dbres.rows[i].img_user_text;
                user.files = [];
                while (i < dbres.rows.length && user.user == dbres.rows[i].img_user_text) {
                    file = Object();
                    file.date = dbres.rows[i].img_time;
                    file.count = dbres.rows[i].img_count;
                    user.files[user.files.length] = file;
                    i++;
                }
                result.users[result.users.length] = user;
            }
            res.json(result);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    })
}

var uploadDateAll = function (req, res, db) {
    let query = `select count(*) as count, to_char(img_timestamp, 'YYYY/MM') as date
                 from images
                 group by date
                 order by date`;

    db.query(query, (err, dbres) => {
        if (!err) {
            res.json(dbres.rows);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    })
}

// USAGE
var usage = function (req, res, db) {
    let usageQuery = `select gil_to,gil_wiki,gil_page_title
                      from usages where is_alive=true
                      order by gil_to, gil_wiki, gil_page_title
                      limit 1000`
    db.query(usageQuery, (err, dbres) => {
        if (!err) {
            result = [];
            dbindex = 0;
            resindex = 0;
            while (dbindex < dbres.rows.length) {
                result[resindex] = new Object();
                result[resindex].image = dbres.rows[dbindex].gil_to;
                page = dbres.rows[dbindex].gil_to;
                result[resindex].pages = [];
                j = 0;
                while (dbindex < dbres.rows.length && page == dbres.rows[dbindex].gil_to) {
                    result[resindex].pages[j] = new Object();
                    result[resindex].pages[j].wiki = dbres.rows[dbindex].gil_wiki;
                    result[resindex].pages[j].title = dbres.rows[dbindex].gil_page_title;
                    j++;
                    dbindex++;
                }
                resindex++;
            }
            res.json(result);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

var usageStat = function (req, res, db) {
    let totalUsageQuery = `select count(*) as c, count(distinct gil_to) as d
                            from usages
                            where is_alive = true`;
    let totalProjectsQuery = `select count(distinct gil_wiki) as c, count(gil_to) as p
                              from usages
                              where is_alive = true`;

    db.query(totalUsageQuery, (err, totalUsage) => {
        if (!err) {
            db.query(totalProjectsQuery, (err, totalProjects) => {
                if (!err) {
                    let result = {};
                    result.totalUsage = totalUsage.rows[0].c;
                    result.totalImagesUsed = totalUsage.rows[0].d;
                    result.totalProjects = totalProjects.rows[0].c;
                    result.totalPages = totalProjects.rows[0].p;
                    res.json(result);
                } else {
                    console.log(err);
                    res.sendStatus(400);
                }
            });
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

var usageTop = function (req, res, db) {
    let topProjectsQuery = `select gil_wiki as tipo, count(*) as n
                              from usages
                              where is_alive = true
                              group by gil_wiki
                              order by n desc
                              limit 10`;

    db.query(topProjectsQuery, (err, top20Projects) => {
        if (!err) {
            res.json(top20Projects.rows);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

var usageSidebar = function (req, res, db) {
    let usage = `select gil_to, count(distinct gil_wiki) as wiki, count(*) as u
                 from usages
                 where is_alive = true
                 group by gil_to
                 order by u desc, wiki desc
                 limit 1000`;

    db.query(usage, (err, dbres) => {
        if (!err) {
            res.json(dbres.rows);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

// VIEWS
var viewsAll = function (req, res, db) {
    db.query('select sum(accesses) from visualizations', (err, dbres) => {
        if (!err) {
            res.json(dbres.rows[0]);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

var viewsByDate = function (req, res, db) {
    db.query('select sum(accesses) as sum,access_date from visualizations group by access_date order by access_date', (err, dbres) => {
        if (!err) {
            result = [];
            i = 0;
            while (i < dbres.rows.length) {
                result[i] = new Object;
                result[i].date = dbres.rows[i].access_date.addHours(1).toISOString().substring(0, 10);//necessario aggiungere un'ora perchè lo vede con tempo +0, e quindi sottrae un ora (andando quindi nel giorno prima) alla data +1 di postgres
                result[i].views = dbres.rows[i].sum;
                i++;
            }
            res.json(result);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

var viewsByFiles = function (req, res, db) {
    let query = `select img_name, sum(accesses) as sum,access_date
                  from visualizations, images
                  where images.is_alive = true
                  and images.media_id = visualizations.media_id
                  group by img_name, access_date
                  order by img_name, access_date
                  limit 10000`
    db.query(query, (err, dbres) => {
        if (!err) {
            res.json(dbres.rows);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

var viewsSidebar = function (req, res, db) {
    let query = `select i.img_name, sum(v.accesses) as tot, avg(v.accesses) as av, PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER by v.accesses) as median
                  from images as i, visualizations as v
                  where i.media_id = v.media_id
                  and i.is_alive = true
                  group by i.img_name
                  order by tot desc
                  limit 10000`
    db.query(query, (err, dbres) => {
        if (!err) {
            res.json(dbres.rows);
        } else {
            console.log(err);
            res.sendStatus(400);
        }
    });
}

exports.index = index;
exports.rootCategory = rootCategory;
exports.totalMediaNum = totalMediaNum;
exports.categoryGraph = categoryGraph;
exports.uploadDate = uploadDate;
exports.uploadDateAll = uploadDateAll;
exports.usage = usage;
exports.usageStat = usageStat;
exports.usageTop = usageTop;
exports.usageSidebar = usageSidebar;
exports.viewsByDate = viewsByDate;
exports.viewsByFiles = viewsByFiles;
exports.viewsAll = viewsAll;
exports.viewsSidebar = viewsSidebar;
