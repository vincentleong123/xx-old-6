// Shopping cart functionality
class ShoppingCart {
  constructor() {
    this.items = JSON.parse(localStorage.getItem('cart_items') || '[]');
  }
  
  addItem(product) {
    const existing = this.items.find(i => i.id === product.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.items.push({ ...product, quantity: 1 });
    }
    this.save();
  }
  
  removeItem(productId) {
    this.items = this.items.filter(i => i.id !== productId);
    this.save();
  }
  
  clear() {
    this.items = [];
    this.save();
  }
  
  save() {
    localStorage.setItem('cart_items', JSON.stringify(this.items));
  }
  
  async checkout() {
    if (this.items.length === 0) return;
    
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: this.items })
      });
      
      const data = await response.json();
      if (data.url) window.location.href = data.url;
    } catch (error) {
      console.error('Checkout failed:', error);
    }
  }
}

// Initialize cart
window.cart = new ShoppingCart();
