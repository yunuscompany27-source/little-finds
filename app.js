var STAGES=['Menunggu pembayaran','Pembayaran terverifikasi','Diproses','Dikirim','Selesai'];
var ICON={Photocard:'🃏',Album:'💿',Poster:'🖼️',Photobook:'📖'};
var HUE={Photocard:'#f7d6e4',Album:'#d9d6f7',Poster:'#fbe7b3',Photobook:'#cfeee0'};
var sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
var products=[],orders=[];
function $(i){return document.getElementById(i)}
function rp(n){return 'Rp'+Number(n).toLocaleString('id-ID')}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function toast(m){var t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2600)}
function show(v){
  ['katalog','pesan','lacak','admin'].forEach(function(k){$('v-'+k).hidden=k!==v});
  document.querySelectorAll('#tabs button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.v===v)});
}
document.querySelectorAll('#tabs button').forEach(function(b){b.onclick=function(){show(b.dataset.v)}});

async function loadProducts(){
  var r=await sb.from('products').select('*').order('id');
  if(r.error){toast('Produk gagal dimuat. Periksa config.js.');return}
  products=r.data;renderCatalog();
}
function renderCatalog(){
  $('catalog').innerHTML=products.map(function(p){
    return '<article class="card"><div class="thumb" style="background:'+(HUE[p.type]||'#eee')+'">'+(ICON[p.type]||'🛍️')+'</div><div class="b"><h3>'+esc(p.name)+'</h3><span class="muted">'+esc(p.type)+(p.close_date?' · GO tutup '+p.close_date:'')+'</span><span class="price">'+rp(p.price)+'</span><button class="btn" data-id="'+p.id+'">Pesan</button></div></article>';
  }).join('');
  $('catalog').querySelectorAll('button').forEach(function(b){b.onclick=function(){$('o-prod').value=b.dataset.id;total();show('pesan')}});
  $('o-prod').innerHTML=products.map(function(p){return '<option value="'+p.id+'">'+esc(p.name)+' – '+rp(p.price)+'</option>'}).join('');
  total();
}
function total(){
  var p=products.filter(function(x){return x.id==$('o-prod').value})[0];
  var q=Math.max(1,parseInt($('o-qty').value)||1);
  $('o-total').textContent='Total: '+rp(p?p.price*q:0);
}
$('o-prod').onchange=total;$('o-qty').oninput=total;

$('o-send').onclick=async function(){
  var n=$('o-name').value.trim(),w=$('o-wa').value.trim(),a=$('o-addr').value.trim();
  if(!$('o-prod').value||!n||!w||!a){toast('Lengkapi nama, nomor WhatsApp, dan alamat.');return}
  $('o-send').disabled=true;
  var r=await sb.rpc('create_order',{p_product:+$('o-prod').value,p_qty:Math.max(1,parseInt($('o-qty').value)||1),p_name:n,p_wa:w,p_addr:a,p_pay:$('o-pay').value});
  $('o-send').disabled=false;
  if(r.error){toast('Pesanan gagal dikirim. Coba lagi.');return}
  $('o-name').value=$('o-wa').value=$('o-addr').value='';
  $('t-code').value=r.data;toast('Pesanan terkirim. Kodemu: '+r.data);
  track();show('lacak');
};

function steps(o){return '<div class="steps">'+STAGES.map(function(s,i){return '<i class="'+(i<=o.stage?'on':'')+'">'+s+'</i>'}).join('')+'</div>'}
async function track(){
  var c=$('t-code').value.trim();if(!c)return;
  var r=await sb.rpc('get_order',{p_code:c});var o=r.data&&r.data[0];
  $('t-out').innerHTML=o?'<div class="panel"><strong>'+esc(o.code)+'</strong> <span class="tag '+(o.stage?'paid':'wait')+'">'+STAGES[o.stage]+'</span><p class="muted" style="margin:6px 0 0">'+o.qty+' × '+esc(o.item)+' · '+rp(o.total)+' · '+esc(o.pay)+'</p>'+steps(o)+'</div>':'<p class="muted">Kode tidak ditemukan. Periksa kembali kode pesananmu.</p>';
}
$('t-go').onclick=track;

async function checkAdmin(){
  var s=await sb.auth.getSession();var ok=false;
  if(s.data.session){var r=await sb.from('admins').select('user_id').maybeSingle();ok=!!(r.data)}
  $('a-login').hidden=ok;$('a-app').hidden=!ok;
  if(ok)loadOrders();
}
$('a-signin').onclick=async function(){
  var r=await sb.auth.signInWithPassword({email:$('a-email').value.trim(),password:$('a-pass').value});
  if(r.error){toast('Email atau kata sandi salah.');return}
  checkAdmin();
};
$('a-signout').onclick=async function(){await sb.auth.signOut();orders=[];checkAdmin()};

$('a-add').onclick=async function(){
  var n=$('a-name').value.trim(),pr=parseInt($('a-price').value);
  if(!n||!(pr>=0)){toast('Isi nama dan harga produk.');return}
  var row={name:n,price:pr,type:$('a-type').value,close_date:$('a-close').value||null};
  var ex=products.filter(function(x){return x.name.toLowerCase()===n.toLowerCase()})[0];
  var r=ex?await sb.from('products').update(row).eq('id',ex.id):await sb.from('products').insert(row);
  if(r.error){toast('Produk gagal disimpan. Pastikan kamu login sebagai admin.');return}
  $('a-name').value=$('a-price').value='';toast('Produk disimpan.');loadProducts();
};
async function loadOrders(){
  var r=await sb.from('orders').select('*').order('id',{ascending:false});
  if(r.error){toast('Pesanan gagal dimuat.');return}
  orders=r.data;renderAdmin();
}
function renderAdmin(){
  $('a-empty').hidden=orders.length>0;
  $('a-orders').innerHTML=orders.map(function(o){
    var act=o.stage===0?'<button class="btn sm" data-id="'+o.id+'">Verifikasi bayar</button>':(o.stage<4?'<button class="btn sm alt" data-id="'+o.id+'">Lanjut: '+STAGES[o.stage+1]+'</button>':'');
    return '<tr><td>'+esc(o.code)+'</td><td>'+esc(o.name)+'<br><span class="muted">'+esc(o.wa)+'</span></td><td>'+o.qty+' × '+esc(o.item)+'<br><span class="muted">'+rp(o.total)+'</span></td><td>'+esc(o.pay)+'</td><td><span class="tag '+(o.stage?'paid':'wait')+'">'+STAGES[o.stage]+'</span><br>'+act+'</td></tr>';
  }).join('');
  $('a-orders').querySelectorAll('button').forEach(function(b){b.onclick=async function(){
    var o=orders.filter(function(x){return x.id==b.dataset.id})[0];
    var r=await sb.from('orders').update({stage:Math.min(4,o.stage+1)}).eq('id',o.id);
    if(r.error){toast('Status gagal diperbarui.');return}
    toast('Status diperbarui.');loadOrders();
  }});
}
loadProducts();checkAdmin();
