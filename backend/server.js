const express = require('express');
const mysql = require('mysql');
const cors = require('cors');


const app = express();
app.use(express.json());
app.use(cors());

// Helper: sanitize phone numbers to digits-only (or null)
function sanitizePhone(value) {
    if (value === undefined || value === null) return null;
    const digits = String(value).replace(/\D/g, '');
    return digits === '' ? null : digits;
}

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crud'
})

app.post('/login', (req, res) => {
    const sql = 'SELECT * FROM login WHERE username = ? AND password = ?';

    db.query(sql, [req.body.email, req.body.password], (err, data) => {
        if (err) return res.json("Error");
        if (data.length > 0) {
            return res.json("Login Successful"); 
        } else {
            return res.status(401).send('Credenciales inválidas');
        }
    })
})

// ---------- Clientes API ----------
// Estructura real de la tabla `clientes` (ahora en minúsculas):
// id (INT AUTO_INCREMENT PK), empresa, nombre, apellido, telefono, correo_electronico, direccion

// Obtener todos los clientes
app.get('/clientes', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, apellido, nit, telefono, correo_electronico AS correo, direccion FROM clientes';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener clientes:', err);
            return res.status(500).json({ error: 'Error al obtener clientes' });
        }
        res.json(results);
    });
});

// Obtener cliente por id
app.get('/clientes/:id', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, apellido, nit, telefono, correo_electronico AS correo, direccion FROM clientes WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener cliente:', err);
            return res.status(500).json({ error: 'Error al obtener cliente' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(results[0]);
    });
});

// Crear nuevo cliente
app.post('/clientes', (req, res) => {
    const { empresa, nombre, apellido, nit, telefono, correo, direccion } = req.body;
    if (!nombre || !apellido) return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
    // sanitize telefono to avoid inserting formatted strings (e.g. "1234-5678") that
    // could be cast/truncated by the DB if the column is numeric
    const telefonoSan = sanitizePhone(telefono);

    const sql = 'INSERT INTO clientes (empresa, nombre, apellido, nit, telefono, correo_electronico, direccion) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [empresa || null, nombre, apellido, nit || null, telefonoSan, correo || null, direccion || null], (err, result) => {
        if (err) {
            console.error('Error al crear cliente:', err);
            return res.status(500).json({ error: 'Error al crear cliente' });
        }
        res.status(201).json({ id: result.insertId, empresa, nombre, apellido, nit: nit || null, telefono: telefonoSan, correo, direccion });
    });
});

// Actualizar cliente
app.put('/clientes/:id', (req, res) => {
    const { empresa, nombre, apellido, nit, telefono, correo, direccion } = req.body;
    const telefonoSan = sanitizePhone(telefono);
    const sql = 'UPDATE clientes SET empresa = ?, nombre = ?, apellido = ?, nit = ?, telefono = ?, correo_electronico = ?, direccion = ? WHERE id = ?';
    db.query(sql, [empresa || null, nombre || null, apellido || null, nit || null, telefonoSan, correo || null, direccion || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar cliente:', err);
            return res.status(500).json({ error: 'Error al actualizar cliente' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json({ message: 'Cliente actualizado' });
    });
});

// Eliminar cliente
app.delete('/clientes/:id', (req, res) => {
    const sql = 'DELETE FROM clientes WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar cliente:', err);
            return res.status(500).json({ error: 'Error al eliminar cliente' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json({ message: 'Cliente eliminado' });
    });
});

// ---------- Proveedores API ----------
// Tabla `proveedores`: id, empresa, nombre, telefono, correo_electronico, direccion

// Obtener todos los proveedores
app.get('/proveedores', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, nit, telefono, correo_electronico AS correo, direccion FROM proveedores';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener proveedores:', err);
            return res.status(500).json({ error: 'Error al obtener proveedores' });
        }
        res.json(results);
    });
});

// Obtener proveedor por id
app.get('/proveedores/:id', (req, res) => {
    const sql = 'SELECT id, empresa, nombre, nit, telefono, correo_electronico AS correo, direccion FROM proveedores WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener proveedor:', err);
            return res.status(500).json({ error: 'Error al obtener proveedor' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json(results[0]);
    });
});

// Crear nuevo proveedor
app.post('/proveedores', (req, res) => {
    const { empresa, nombre, nit, telefono, correo, direccion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    const telefonoSan = sanitizePhone(telefono);

    const sql = 'INSERT INTO proveedores (empresa, nombre, nit, telefono, correo_electronico, direccion) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [empresa || null, nombre, nit || null, telefonoSan, correo || null, direccion || null], (err, result) => {
        if (err) {
            console.error('Error al crear proveedor:', err);
            return res.status(500).json({ error: 'Error al crear proveedor' });
        }
        res.status(201).json({ id: result.insertId, empresa, nombre, nit: nit || null, telefono: telefonoSan, correo, direccion });
    });
});

// Actualizar proveedor
app.put('/proveedores/:id', (req, res) => {
    const { empresa, nombre, nit, telefono, correo, direccion } = req.body;
    const telefonoSan = sanitizePhone(telefono);
    const sql = 'UPDATE proveedores SET empresa = ?, nombre = ?, nit = ?, telefono = ?, correo_electronico = ?, direccion = ? WHERE id = ?';
    db.query(sql, [empresa || null, nombre || null, nit || null, telefonoSan, correo || null, direccion || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar proveedor:', err);
            return res.status(500).json({ error: 'Error al actualizar proveedor' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json({ message: 'Proveedor actualizado' });
    });
});

// Eliminar proveedor
app.delete('/proveedores/:id', (req, res) => {
    const sql = 'DELETE FROM proveedores WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar proveedor:', err);
            return res.status(500).json({ error: 'Error al eliminar proveedor' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
        res.json({ message: 'Proveedor eliminado' });
    });
});

// ---------- Productos API ----------
// Tabla `productos`: id, nombre, medida, precio, stock, descripcion, proveedor_id

// Obtener todos los productos
app.get('/productos', (req, res) => {
    const sql = 'SELECT id, nombre, medida, precio, stock, descripcion, proveedor_id FROM productos';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            return res.status(500).json({ error: 'Error al obtener productos' });
        }
        res.json(results);
    });
});

// Obtener producto por id
app.get('/productos/:id', (req, res) => {
    const sql = 'SELECT id, nombre, medida, precio, stock, descripcion, proveedor_id FROM productos WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener producto:', err);
            return res.status(500).json({ error: 'Error al obtener producto' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(results[0]);
    });
});

// Crear nuevo producto
app.post('/productos', (req, res) => {
    const { nombre, medida, precio, stock, descripcion, proveedor_id } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });

    const sql = 'INSERT INTO productos (nombre, medida, precio, stock, descripcion, proveedor_id) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [nombre, medida || null, precio || null, stock || null, descripcion || null, proveedor_id || null], (err, result) => {
        if (err) {
            console.error('Error al crear producto:', err);
            return res.status(500).json({ error: 'Error al crear producto' });
        }
        res.status(201).json({ id: result.insertId, nombre, medida, precio, stock, descripcion, proveedor_id });
    });
});

// Actualizar producto
app.put('/productos/:id', (req, res) => {
    const { nombre, medida, precio, stock, descripcion, proveedor_id } = req.body;
    const sql = 'UPDATE productos SET nombre = ?, medida = ?, precio = ?, stock = ?, descripcion = ?, proveedor_id = ? WHERE id = ?';
    db.query(sql, [nombre || null, medida || null, precio || null, stock || null, descripcion || null, proveedor_id || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar producto:', err);
            return res.status(500).json({ error: 'Error al actualizar producto' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ message: 'Producto actualizado' });
    });
});

// Eliminar producto
app.delete('/productos/:id', (req, res) => {
    const sql = 'DELETE FROM productos WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            return res.status(500).json({ error: 'Error al eliminar producto' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ message: 'Producto eliminado' });
    });
});

// ---------- Compras API ----------
// Tabla `compras`: id, fecha, proveedor_id, total
app.get('/compras', (req, res) => {
    // Optional date range filters: fecha_inicio, fecha_fin in YYYY-MM-DD
    // Join with proveedores to include proveedor name
    let sql = 'SELECT compras.id, compras.fecha, compras.proveedor_id, proveedores.nombre AS proveedor, compras.total FROM compras LEFT JOIN proveedores ON compras.proveedor_id = proveedores.id';
    const params = [];
    if (req.query.fecha_inicio && req.query.fecha_fin) {
        sql += ' WHERE compras.fecha BETWEEN ? AND ?';
        params.push(req.query.fecha_inicio, req.query.fecha_fin);
    } else if (req.query.fecha_inicio) {
        sql += ' WHERE compras.fecha >= ?';
        params.push(req.query.fecha_inicio);
    } else if (req.query.fecha_fin) {
        sql += ' WHERE compras.fecha <= ?';
        params.push(req.query.fecha_fin);
    }
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener compras:', err);
            return res.status(500).json({ error: 'Error al obtener compras' });
        }
        res.json(results);
    });
});

app.get('/compras/:id', (req, res) => {
    const sql = 'SELECT compras.id, compras.fecha, compras.proveedor_id, proveedores.nombre AS proveedor, compras.total FROM compras LEFT JOIN proveedores ON compras.proveedor_id = proveedores.id WHERE compras.id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener compra:', err);
            return res.status(500).json({ error: 'Error al obtener compra' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Compra no encontrada' });
        res.json(results[0]);
    });
});

app.post('/compras', (req, res) => {
    const { fecha, proveedor_id, total } = req.body;
    if (!fecha || !proveedor_id) return res.status(400).json({ error: 'fecha y proveedor_id son requeridos' });
    const sql = 'INSERT INTO compras (fecha, proveedor_id, total) VALUES (?, ?, ?)';
    db.query(sql, [fecha, proveedor_id, total || 0], (err, result) => {
        if (err) {
            console.error('Error al crear compra:', err);
            return res.status(500).json({ error: 'Error al crear compra' });
        }
        res.status(201).json({ id: result.insertId, fecha, proveedor_id, total: total || 0 });
    });
});

app.put('/compras/:id', (req, res) => {
    const { fecha, proveedor_id, total } = req.body;
    const sql = 'UPDATE compras SET fecha = ?, proveedor_id = ?, total = ? WHERE id = ?';
    db.query(sql, [fecha || null, proveedor_id || null, total || 0, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar compra:', err);
            return res.status(500).json({ error: 'Error al actualizar compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Compra no encontrada' });
        res.json({ message: 'Compra actualizada' });
    });
});

app.delete('/compras/:id', (req, res) => {
    const sql = 'DELETE FROM compras WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar compra:', err);
            return res.status(500).json({ error: 'Error al eliminar compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Compra no encontrada' });
        res.json({ message: 'Compra eliminada' });
    });
});

// Detalle Compras
// Tabla `detalle_compras`: id, compra_id, producto_id, cantidad, precio_unitario, subtotal
app.get('/compras/:id/detalle', (req, res) => {
    const sql = 'SELECT detalle_compras.id, detalle_compras.compra_id, detalle_compras.producto_id, productos.nombre AS producto, detalle_compras.cantidad, detalle_compras.precio_unitario, detalle_compras.subtotal FROM detalle_compras LEFT JOIN productos ON detalle_compras.producto_id = productos.id WHERE detalle_compras.compra_id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener detalle de compra:', err);
            return res.status(500).json({ error: 'Error al obtener detalle de compra' });
        }
        res.json(results);
    });
});

app.post('/compras/:id/detalle', (req, res) => {
    const compraId = req.params.id;
    const { producto_id, cantidad, precio_unitario } = req.body;
    if (!producto_id || !cantidad) return res.status(400).json({ error: 'producto_id y cantidad son requeridos' });
    const subtotal = (precio_unitario || 0) * Number(cantidad);
    const sql = 'INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [compraId, producto_id, cantidad, precio_unitario || 0, subtotal], (err, result) => {
        if (err) {
            console.error('Error al crear detalle de compra:', err);
            return res.status(500).json({ error: 'Error al crear detalle de compra' });
        }
        res.status(201).json({ id: result.insertId, compra_id: compraId, producto_id, cantidad, precio_unitario, subtotal });
    });
});

app.put('/detalle-compras/:id', (req, res) => {
    const { producto_id, cantidad, precio_unitario } = req.body;
    const subtotal = (precio_unitario || 0) * Number(cantidad || 0);
    const sql = 'UPDATE detalle_compras SET producto_id = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?';
    db.query(sql, [producto_id || null, cantidad || 0, precio_unitario || 0, subtotal, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar detalle de compra:', err);
            return res.status(500).json({ error: 'Error al actualizar detalle de compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de compra actualizado' });
    });
});

app.delete('/detalle-compras/:id', (req, res) => {
    const sql = 'DELETE FROM detalle_compras WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar detalle de compra:', err);
            return res.status(500).json({ error: 'Error al eliminar detalle de compra' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de compra eliminado' });
    });
});

// ---------- Ventas API ----------
// Tabla `ventas`: id, fecha, cliente_id, monto
app.get('/ventas', (req, res) => {
    // Join with clientes to include cliente name
    let sql = 'SELECT ventas.id, ventas.fecha, ventas.cliente_id, clientes.nombre AS cliente, ventas.monto FROM ventas LEFT JOIN clientes ON ventas.cliente_id = clientes.id';
    const params = [];
    if (req.query.fecha_inicio && req.query.fecha_fin) {
        sql += ' WHERE ventas.fecha BETWEEN ? AND ?';
        params.push(req.query.fecha_inicio, req.query.fecha_fin);
    } else if (req.query.fecha_inicio) {
        sql += ' WHERE ventas.fecha >= ?';
        params.push(req.query.fecha_inicio);
    } else if (req.query.fecha_fin) {
        sql += ' WHERE ventas.fecha <= ?';
        params.push(req.query.fecha_fin);
    }
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener ventas:', err);
            return res.status(500).json({ error: 'Error al obtener ventas' });
        }
        res.json(results);
    });
});

app.get('/ventas/:id', (req, res) => {
    const sql = 'SELECT ventas.id, ventas.fecha, ventas.cliente_id, clientes.nombre AS cliente, ventas.monto FROM ventas LEFT JOIN clientes ON ventas.cliente_id = clientes.id WHERE ventas.id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener venta:', err);
            return res.status(500).json({ error: 'Error al obtener venta' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json(results[0]);
    });
});

app.post('/ventas', (req, res) => {
    const { fecha, cliente_id, monto } = req.body;
    if (!fecha || !cliente_id) return res.status(400).json({ error: 'fecha y cliente_id son requeridos' });
    const sql = 'INSERT INTO ventas (fecha, cliente_id, monto) VALUES (?, ?, ?)';
    db.query(sql, [fecha, cliente_id, monto || 0], (err, result) => {
        if (err) {
            console.error('Error al crear venta:', err);
            return res.status(500).json({ error: 'Error al crear venta' });
        }
        res.status(201).json({ id: result.insertId, fecha, cliente_id, monto: monto || 0 });
    });
});

app.put('/ventas/:id', (req, res) => {
    const { fecha, cliente_id, monto } = req.body;
    const sql = 'UPDATE ventas SET fecha = ?, cliente_id = ?, monto = ? WHERE id = ?';
    db.query(sql, [fecha || null, cliente_id || null, monto || 0, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar venta:', err);
            return res.status(500).json({ error: 'Error al actualizar venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json({ message: 'Venta actualizada' });
    });
});

app.delete('/ventas/:id', (req, res) => {
    const sql = 'DELETE FROM ventas WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar venta:', err);
            return res.status(500).json({ error: 'Error al eliminar venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json({ message: 'Venta eliminada' });
    });
});

// Detalle Ventas
// Tabla `detalle_ventas`: id, venta_id, producto_id, cantidad, precio_unitario, subtotal
app.get('/ventas/:id/detalle', (req, res) => {
    const sql = 'SELECT detalle_ventas.id, detalle_ventas.venta_id, detalle_ventas.producto_id, productos.nombre AS producto, detalle_ventas.cantidad, detalle_ventas.precio_unitario, detalle_ventas.subtotal FROM detalle_ventas LEFT JOIN productos ON detalle_ventas.producto_id = productos.id WHERE detalle_ventas.venta_id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener detalle de venta:', err);
            return res.status(500).json({ error: 'Error al obtener detalle de venta' });
        }
        res.json(results);
    });
});

app.post('/ventas/:id/detalle', (req, res) => {
    const ventaId = req.params.id;
    const { producto_id, cantidad, precio_unitario } = req.body;
    if (!producto_id || !cantidad) return res.status(400).json({ error: 'producto_id y cantidad son requeridos' });
    const subtotal = (precio_unitario || 0) * Number(cantidad);
    const sql = 'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [ventaId, producto_id, cantidad, precio_unitario || 0, subtotal], (err, result) => {
        if (err) {
            console.error('Error al crear detalle de venta:', err);
            return res.status(500).json({ error: 'Error al crear detalle de venta' });
        }
        res.status(201).json({ id: result.insertId, venta_id: ventaId, producto_id, cantidad, precio_unitario, subtotal });
    });
});

app.put('/detalle-ventas/:id', (req, res) => {
    const { producto_id, cantidad, precio_unitario } = req.body;
    const subtotal = (precio_unitario || 0) * Number(cantidad || 0);
    const sql = 'UPDATE detalle_ventas SET producto_id = ?, cantidad = ?, precio_unitario = ?, subtotal = ? WHERE id = ?';
    db.query(sql, [producto_id || null, cantidad || 0, precio_unitario || 0, subtotal, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar detalle de venta:', err);
            return res.status(500).json({ error: 'Error al actualizar detalle de venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de venta actualizado' });
    });
});

app.delete('/detalle-ventas/:id', (req, res) => {
    const sql = 'DELETE FROM detalle_ventas WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar detalle de venta:', err);
            return res.status(500).json({ error: 'Error al eliminar detalle de venta' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
        res.json({ message: 'Detalle de venta eliminado' });
    });
});

// ---------- Inventarios API ----------
// Tabla `inventarios`: id, producto_id, cantidad, ubicacion
app.get('/inventarios', (req, res) => {
    const sql = 'SELECT id, producto_id, cantidad, ubicacion FROM inventarios';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al obtener inventarios:', err);
            return res.status(500).json({ error: 'Error al obtener inventarios' });
        }
        res.json(results);
    });
});

app.get('/inventarios/:id', (req, res) => {
    const sql = 'SELECT id, producto_id, cantidad, ubicacion FROM inventarios WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error al obtener inventario:', err);
            return res.status(500).json({ error: 'Error al obtener inventario' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Inventario no encontrado' });
        res.json(results[0]);
    });
});

app.post('/inventarios', (req, res) => {
    const { producto_id, cantidad, ubicacion } = req.body;
    if (!producto_id) return res.status(400).json({ error: 'producto_id es requerido' });
    const sql = 'INSERT INTO inventarios (producto_id, cantidad, ubicacion) VALUES (?, ?, ?)';
    db.query(sql, [producto_id, cantidad || 0, ubicacion || null], (err, result) => {
        if (err) {
            console.error('Error al crear inventario:', err);
            return res.status(500).json({ error: 'Error al crear inventario' });
        }
        res.status(201).json({ id: result.insertId, producto_id, cantidad: cantidad || 0, ubicacion: ubicacion || null });
    });
});

app.put('/inventarios/:id', (req, res) => {
    const { producto_id, cantidad, ubicacion } = req.body;
    const sql = 'UPDATE inventarios SET producto_id = ?, cantidad = ?, ubicacion = ? WHERE id = ?';
    db.query(sql, [producto_id || null, cantidad || 0, ubicacion || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error al actualizar inventario:', err);
            return res.status(500).json({ error: 'Error al actualizar inventario' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Inventario no encontrado' });
        res.json({ message: 'Inventario actualizado' });
    });
});

app.delete('/inventarios/:id', (req, res) => {
    const sql = 'DELETE FROM inventarios WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar inventario:', err);
            return res.status(500).json({ error: 'Error al eliminar inventario' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Inventario no encontrado' });
        res.json({ message: 'Inventario eliminado' });
    });
});

// ---------- Facturacion API ----------
// Tabla `facturacion`: id, fecha, cliente_id

// Obtener todas las facturas (incluir nombre de cliente)
app.get('/facturacion', (req, res) => {
    let sql = 'SELECT facturacion.id, facturacion.fecha, facturacion.cliente_id, CONCAT(clientes.nombre, " ", IFNULL(clientes.apellido, "")) AS cliente FROM facturacion LEFT JOIN clientes ON facturacion.cliente_id = clientes.id';
    const params = [];
    if (req.query.cliente_id) {
        sql += ' WHERE facturacion.cliente_id = ?';
        params.push(req.query.cliente_id);
    }
    if (req.query.fecha_inicio && req.query.fecha_fin) {
        sql += params.length ? ' AND facturacion.fecha BETWEEN ? AND ?' : ' WHERE facturacion.fecha BETWEEN ? AND ?';
        params.push(req.query.fecha_inicio, req.query.fecha_fin);
    } else if (req.query.fecha_inicio) {
        sql += params.length ? ' AND facturacion.fecha >= ?' : ' WHERE facturacion.fecha >= ?';
        params.push(req.query.fecha_inicio);
    } else if (req.query.fecha_fin) {
        sql += params.length ? ' AND facturacion.fecha <= ?' : ' WHERE facturacion.fecha <= ?';
        params.push(req.query.fecha_fin);
    }
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error al obtener facturas:', err);
            return res.status(500).json({ error: 'Error al obtener facturas' });
        }
        res.json(results);
    });
});

// Crear nueva factura
app.post('/facturacion', (req, res) => {
    const { fecha, cliente_id } = req.body;
    if (!fecha || !cliente_id) return res.status(400).json({ error: 'fecha y cliente_id son requeridos' });
    const sql = 'INSERT INTO facturacion (fecha, cliente_id) VALUES (?, ?)';
    db.query(sql, [fecha, cliente_id], (err, result) => {
        if (err) {
            console.error('Error al crear factura:', err);
            return res.status(500).json({ error: 'Error al crear factura' });
        }
        res.status(201).json({ id: result.insertId, fecha, cliente_id });
    });
});

// Eliminar factura
app.delete('/facturacion/:id', (req, res) => {
    const sql = 'DELETE FROM facturacion WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error al eliminar factura:', err);
            return res.status(500).json({ error: 'Error al eliminar factura' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Factura no encontrada' });
        res.json({ message: 'Factura eliminada' });
    });
});

app.listen(8081, () => {
    console.log('Server is running on port 8081');
});
 